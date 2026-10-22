// How local-check runs git, gh, pnpm and docker: two injectable functions, so
// tests pass fakes. `run` captures output and throws on failure; `stream`
// shows a suite's output as it goes and resolves to its exit code.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";

/** env adds to the process's; a key set to undefined is removed. */
type Env = Record<string, string | undefined>;

export type Run = (cmd: string, args: string[], opts?: { cwd?: string; env?: Env }) => string;

export type Stream = (
  cmd: string,
  args: string[],
  opts: { cwd: string; env?: Env },
) => Promise<number>;

export const realRun: Run = (cmd, args, opts = {}) => {
  try {
    return execFileSync(cmd, args, {
      cwd: opts.cwd,
      env: opts.env === undefined ? process.env : withEnv(opts.env),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    const detail = typeof stderr === "string" && stderr.trim() !== "" ? `: ${stderr.trim()}` : "";
    throw new Error(`${cmd} ${args.join(" ")} failed${detail}`, { cause: error });
  }
};

/** Signals a detached child's whole process group (the child's pid is its group's), and only that. */
function groupKiller(child: ChildProcess) {
  return (signal: NodeJS.Signals) => {
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // The group has already exited.
      }
    }
  };
}

// What an interrupt (SIGINT, SIGTERM) must stop before local-check exits: each
// running suite and launched server. One handler for all of them, so every
// one is stopped gracefully, in parallel, before the exit; a second signal
// while that is under way kills what is left at once and exits.
interface Interruptible {
  /** Ask it to stop and resolve once it has (SIGKILL after its grace). */
  stop: (signal: NodeJS.Signals) => Promise<void>;
  /** Kill it now, synchronously. */
  kill: () => void;
}
const interruptible = new Set<Interruptible>();
let interrupted = false;

function onInterrupt(signal: NodeJS.Signals) {
  const code = signal === "SIGINT" ? 130 : 143;
  if (interrupted) {
    for (const one of interruptible) one.kill();
    process.exit(code);
  }
  interrupted = true;
  void Promise.all([...interruptible].map((one) => one.stop(signal))).finally(() => {
    process.exit(code);
  });
}

/** Registers something an interrupt must stop; the returned function unregisters it. */
function whileRunning(one: Interruptible): () => void {
  if (interruptible.size === 0) {
    process.on("SIGINT", onInterrupt);
    process.on("SIGTERM", onInterrupt);
  }
  interruptible.add(one);
  return () => {
    interruptible.delete(one);
    if (interruptible.size === 0) {
      process.removeListener("SIGINT", onInterrupt);
      process.removeListener("SIGTERM", onInterrupt);
    }
  };
}

/**
 * Runs a suite in its own process group. When local-check is interrupted or
 * killed (a tool's timeout sends SIGTERM), the whole group goes with it: an
 * e2e run left behind would keep its servers on their ports after the lock
 * that guarded them was broken.
 *
 * A suite that prints nothing for idleMs is hung, not slow (a
 * Vitest browser run sat silent at 0% CPU, holding the heavy lock every other
 * push waited on): its group gets SIGTERM, SIGKILL after graceMs, and the
 * suite fails with 124. So its output is piped through to watch it, and
 * FORCE_COLOR keeps a terminal's colours.
 */
export function streamWith(watch: {
  idleMs: number;
  graceMs: number;
  log: (line: string) => void;
}): Stream {
  return (cmd, args, opts) =>
    new Promise((resolve) => {
      const tty = process.stdout.isTTY && process.env.NO_COLOR === undefined;
      const env = opts.env === undefined ? process.env : withEnv(opts.env);
      const child = spawn(cmd, args, {
        cwd: opts.cwd,
        env: tty && env.FORCE_COLOR === undefined ? { ...env, FORCE_COLOR: "1" } : env,
        stdio: ["inherit", "pipe", "pipe"],
        detached: true,
      });
      const killGroup = groupKiller(child);
      let hung = false;
      let idle: NodeJS.Timeout | undefined;
      let grace: NodeJS.Timeout | undefined;
      const quiet = () => {
        hung = true;
        watch.log(
          `local-check: ${cmd} ${args.join(" ")} printed nothing for ${String(Math.round(watch.idleMs / 60_000))} min: stopped as hung`,
        );
        killGroup("SIGTERM");
        grace = setTimeout(() => {
          killGroup("SIGKILL");
        }, watch.graceMs);
      };
      const heard = () => {
        if (hung) return;
        clearTimeout(idle);
        idle = setTimeout(quiet, watch.idleMs);
      };
      heard();
      child.stdout.on("data", (chunk: Buffer) => {
        heard();
        process.stdout.write(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        heard();
        process.stderr.write(chunk);
      });
      let ended: () => void = () => undefined;
      const exited = new Promise<void>((resolveExit) => {
        ended = resolveExit;
      });
      const unregister = whileRunning({
        stop: async (signal) => {
          killGroup(signal);
          const late = setTimeout(() => {
            killGroup("SIGKILL");
          }, watch.graceMs);
          await exited;
          clearTimeout(late);
        },
        kill: () => {
          killGroup("SIGKILL");
        },
      });
      const done = (code: number) => {
        clearTimeout(idle);
        clearTimeout(grace);
        unregister();
        ended();
        resolve(hung ? 124 : code);
      };
      child.on("error", () => {
        done(127);
      });
      child.on("close", (code) => {
        done(code ?? 1);
      });
    });
}

/** A process that stays up (`pnpm dev`), started by launchWith. */
export interface Launched {
  /** The tail of what it printed, stdout and stderr together. */
  output: () => string;
  /** Stops what it started (its group and descendants, by pid): SIGTERM, then SIGKILL for what outlasts the grace. Safe to call again. */
  stop: () => Promise<void>;
}

export type Launch = (cmd: string, args: string[], opts: { cwd: string; env?: Env }) => Launched;

const KEEP_OUTPUT = 20_000;

/** The pids below `root` in the process tree, by parentage, whatever group each is in. */
function descendants(root: number): number[] {
  let table: string;
  try {
    table = execFileSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" });
  } catch {
    return []; // no ps: the group kill is all there is
  }
  const children = new Map<number, number[]>();
  for (const line of table.split("\n")) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (pid === undefined || ppid === undefined || Number.isNaN(pid) || Number.isNaN(ppid))
      continue;
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  }
  const found: number[] = [];
  const queue = [root];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const child of children.get(next) ?? []) {
      found.push(child);
      queue.push(child);
    }
  }
  return found;
}

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Starts a process in its own group and stops what it started, by pid, never
 * by name (other sessions' dev servers are not ours to kill). Turbo runs each
 * task in a group of its own, so the group is not the whole tree: stopping
 * snapshots the launched process's descendants (`ps`) and signals those pids
 * too. Stopping is SIGTERM to all of them, a wait for each to go (up to
 * graceMs), then SIGKILL to what is left. If local-check is interrupted
 * (SIGINT, SIGTERM) it stops the same way before it exits; if it exits some
 * other way, what is left is killed at once.
 */
export function launchWith(watch: { graceMs: number }): Launch {
  return (cmd, args, opts) => {
    let printed = "";
    const keep = (chunk: Buffer) => {
      printed = (printed + chunk.toString()).slice(-KEEP_OUTPUT);
    };
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env === undefined ? process.env : withEnv(opts.env),
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    const killGroup = groupKiller(child);
    const signalTree = (pids: number[], signal: NodeJS.Signals) => {
      for (const pid of pids) {
        try {
          process.kill(pid, signal);
        } catch {
          // Already gone.
        }
      }
    };
    const closed = new Promise<void>((resolve) => {
      child.on("error", (error) => {
        printed += `could not start ${cmd}: ${error.message}\n`;
        resolve();
      });
      child.on("close", () => {
        resolve();
      });
    });
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const tree = () => (child.pid === undefined ? [] : descendants(child.pid));
    // Every pid seen below the launched process: after the leader dies its
    // children are reparented, and no longer found by parentage.
    let known: number[] = [];
    const leave = () => {
      const present = tree();
      killGroup("SIGKILL");
      signalTree([...new Set([...known, ...present])], "SIGKILL");
    };
    let stopping: Promise<void> | undefined;
    const stop = () => {
      stopping ??= (async () => {
        const members = tree();
        known = members;
        killGroup("SIGTERM");
        signalTree(members, "SIGTERM");
        const grace = setTimeout(() => {
          killGroup("SIGKILL");
          signalTree(members, "SIGKILL");
        }, watch.graceMs);
        await closed;
        for (let waited = 0; waited < watch.graceMs && members.some(isAlive); waited += 50) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        clearTimeout(grace);
        // What is still there (the group's other members, a descendant that
        // ignored SIGTERM) goes now.
        killGroup("SIGKILL");
        signalTree(members.filter(isAlive), "SIGKILL");
        process.removeListener("exit", leave);
        unregister();
      })();
      return stopping;
    };
    const unregister = whileRunning({
      stop: () => stop(),
      kill: leave,
    });
    process.once("exit", leave);
    return { output: () => printed, stop };
  };
}

export const realLaunch: Launch = launchWith({ graceMs: 10_000 });

/** Healthy suites print at least once per test file; a next build's longest
 * silence is a few minutes. */
export const realStream: Stream = streamWith({
  idleMs: 15 * 60_000,
  graceMs: 10_000,
  log: (line) => {
    process.stderr.write(`${line}\n`);
  },
});

function withEnv(changes: Env): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) Reflect.deleteProperty(env, key);
    else env[key] = value;
  }
  return env;
}
