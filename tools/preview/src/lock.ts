// One `pnpm preview` at a time decides ports and launches servers: two runs
// racing would both see the same ports free (or 8787, for older branches).
// mkdir is atomic, so the lock is a directory beside the repo's .git data.
import { mkdirSync, rmSync, statSync } from "node:fs";

interface LockOptions {
  /** A lock older than this was left by a crashed run, and is broken. */
  staleMs?: number;
  /** How long to wait for another run before giving up. */
  waitMs?: number;
}

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function tryAcquire(dir: string, staleMs: number): boolean {
  try {
    mkdirSync(dir);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  try {
    if (Date.now() - statSync(dir).mtimeMs > staleMs) rmSync(dir, { force: true, recursive: true });
  } catch {
    // The holder released it between the two calls; the next try takes it.
  }
  return false;
}

export async function withLock<T>(
  dir: string,
  fn: () => Promise<T>,
  { staleMs = 5 * 60_000, waitMs = 5 * 60_000 }: LockOptions = {},
): Promise<T> {
  const deadline = Date.now() + waitMs;
  while (!tryAcquire(dir, staleMs)) {
    if (Date.now() > deadline) {
      throw new Error(`Another pnpm preview is still starting (lock: ${dir}). Try again shortly.`);
    }
    await sleep(100);
  }
  try {
    return await fn();
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}
