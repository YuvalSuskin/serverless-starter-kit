import { spawn } from "node:child_process";
import { closeSync, openSync, readFileSync } from "node:fs";
import net from "node:net";

export interface Launch {
  args: readonly string[];
  command: string;
  cwd: string;
  /** Applied only where the caller's own environment leaves a variable unset. */
  defaultEnv?: Record<string, string>;
  env: Record<string, string>;
  log: string;
}

/**
 * Starts a detached process group whose output goes to a log file. It keeps
 * running after preview exits; stop it by signalling the group (-pid).
 */
export function launchDetached(launch: Launch): number {
  const fd = openSync(launch.log, "a");
  try {
    const child = spawn(launch.command, [...launch.args], {
      cwd: launch.cwd,
      detached: true,
      env: { ...launch.defaultEnv, ...process.env, ...launch.env },
      stdio: ["ignore", fd, fd],
    });
    // A missing program is reported through pid === undefined below.
    child.on("error", () => undefined);
    child.unref();
    if (child.pid === undefined) throw new Error(`Could not start ${launch.command}`);
    return child.pid;
  } finally {
    closeSync(fd);
  }
}

/**
 * Whether any process of the group led by `pid` is alive. Preview launches
 * each server as its own group (pnpm, then next or tsx under it), and the
 * leader can exit before its children do.
 */
function isGroupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function isListening(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = (listening: boolean) => {
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(timeoutMs, () => {
      done(false);
    });
    socket.once("connect", () => {
      done(true);
    });
    socket.once("error", () => {
      done(false);
    });
  });
}

export function canBind(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      resolve(false);
    });
    server.listen({ exclusive: true, host: "127.0.0.1", port }, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

export async function isPortFree(port: number): Promise<boolean> {
  return !(await isListening(port)) && (await canBind(port));
}

export interface Signals {
  isAlive: (pid: number) => boolean;
  kill: (pid: number, signal: NodeJS.Signals) => void;
  sleep: (ms: number) => Promise<void>;
}

export const realSignals: Signals = {
  isAlive: isGroupAlive,
  kill: (pid, signal) => {
    try {
      process.kill(-pid, signal);
    } catch {
      // The group is already gone.
    }
  },
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

/** SIGTERM each process group, wait up to graceMs, then SIGKILL what is left. */
export async function stopGroups(
  pids: readonly number[],
  signals: Signals,
  graceMs = 5000,
): Promise<void> {
  for (const pid of pids) signals.kill(pid, "SIGTERM");
  const running = () => pids.filter((pid) => signals.isAlive(pid));
  for (let waited = 0; waited < graceMs && running().length > 0; waited += 100) {
    await signals.sleep(100);
  }
  for (const pid of running()) signals.kill(pid, "SIGKILL");
}

export interface Clock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export async function waitForHealth(
  url: string,
  fetchFn: typeof fetch,
  clock: Clock,
  timeoutMs = 60_000,
): Promise<boolean> {
  const deadline = clock.now() + timeoutMs;
  while (clock.now() < deadline) {
    try {
      if ((await fetchFn(url)).ok) return true;
    } catch {
      // Not up yet.
    }
    await clock.sleep(500);
  }
  return false;
}

export function tail(file: string, lines = 30): string {
  try {
    return readFileSync(file, "utf8").trimEnd().split("\n").slice(-lines).join("\n");
  } catch {
    return "(no log)";
  }
}
