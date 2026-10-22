// One heavy suite at a time on this machine (CI decisions CI12). Parallel
// agents each running e2e at once loaded the laptop to 80-136 and would meet
// on the e2e servers' fixed ports; queued, each runs at full speed. The lock
// is a directory in the git data every worktree shares (mkdir is atomic),
// holding its owner's pid: a run can take many minutes, so a lock is stale
// when its process is gone, or (a reused pid, a hung run) after MAX_HOLD_MS,
// far longer than any suite takes.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const MAX_HOLD_MS = 2 * 60 * 60_000;

interface Owner {
  pid: number;
  worktree: string;
  what: string;
  since: string;
}

export interface LockOptions {
  pollMs?: number;
  /** Whether a process still runs; injectable for tests. */
  isAlive?: (pid: number) => boolean;
  log?: (line: string) => void;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it runs, as another user.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

const OWNER = "owner.json";

function readOwner(dir: string): Owner | undefined {
  try {
    return JSON.parse(readFileSync(path.join(dir, OWNER), "utf8")) as Owner;
  } catch {
    return undefined;
  }
}

function tryAcquire(dir: string, me: Owner): boolean {
  try {
    mkdirSync(dir, { recursive: false });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return false;
  }
  writeFileSync(path.join(dir, OWNER), JSON.stringify(me));
  return true;
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export async function withHeavyLock<T>(
  dir: string,
  me: Omit<Owner, "pid" | "since">,
  fn: () => T | Promise<T>,
  { pollMs = 2000, isAlive = processAlive, log = () => undefined }: LockOptions = {},
): Promise<T> {
  mkdirSync(path.dirname(dir), { recursive: true });
  const owner: Owner = { ...me, pid: process.pid, since: new Date().toISOString() };
  let told = "";
  let emptySince: number | undefined;
  while (!tryAcquire(dir, owner)) {
    const holder = readOwner(dir);
    if (holder === undefined) {
      // Created a moment ago and its owner not written yet, or left by a
      // crash between the two: broken after a few polls.
      emptySince ??= Date.now();
      if (Date.now() - emptySince > pollMs * 3) rmSync(dir, { force: true, recursive: true });
    } else if (isAlive(holder.pid) && Date.now() - Date.parse(holder.since) < MAX_HOLD_MS) {
      emptySince = undefined;
      const line = `local-check: waiting for ${holder.worktree} (${holder.what}, since ${holder.since.slice(11, 19)} UTC)`;
      if (line !== told) log(line);
      told = line;
    } else {
      log(
        `local-check: breaking a lock left by a run that ended or hung (pid ${String(holder.pid)})`,
      );
      rmSync(dir, { force: true, recursive: true });
    }
    await sleep(pollMs);
  }
  const release = () => {
    if (readOwner(dir)?.pid === process.pid) rmSync(dir, { force: true, recursive: true });
  };
  process.once("exit", release);
  try {
    return await fn();
  } finally {
    process.removeListener("exit", release);
    release();
  }
}
