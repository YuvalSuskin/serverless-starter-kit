import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { withHeavyLock } from "./lock.ts";

const lockDir = () => path.join(mkdtempSync(path.join(tmpdir(), "local-check-")), "heavy.lock");
const me = { worktree: "/w/a", what: "e2e, production build" };

describe("withHeavyLock", () => {
  it("runs one heavy suite at a time: the second waits for the first, and says for whom", async () => {
    const dir = lockDir();
    const order: string[] = [];
    const lines: string[] = [];
    let release: () => void = () => undefined;
    const first = withHeavyLock(dir, me, async () => {
      order.push("first in");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      order.push("first out");
    });
    const second = withHeavyLock(
      dir,
      { worktree: "/w/b", what: "contract and bundle tests" },
      () => {
        order.push("second in");
      },
      { pollMs: 20, log: (line) => lines.push(line) },
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(order).toEqual(["first in"]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^local-check: waiting for \/w\/a \(e2e, production build, since /);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["first in", "first out", "second in"]);
    expect(existsSync(dir)).toBe(false);
  });

  it("releases the lock when the suite throws", async () => {
    const dir = lockDir();
    await expect(withHeavyLock(dir, me, () => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );
    expect(existsSync(dir)).toBe(false);
  });

  it("breaks a lock whose process has ended, however recent", async () => {
    const dir = lockDir();
    mkdirSync(dir);
    writeFileSync(
      path.join(dir, "owner.json"),
      JSON.stringify({
        pid: 999_999,
        worktree: "/w/gone",
        what: "e2e",
        since: new Date().toISOString(),
      }),
    );
    const lines: string[] = [];
    const result = await withHeavyLock(dir, me, () => "ran", {
      pollMs: 10,
      isAlive: () => false,
      log: (line) => lines.push(line),
    });
    expect(result).toBe("ran");
    expect(lines).toEqual([
      "local-check: breaking a lock left by a run that ended or hung (pid 999999)",
    ]);
  });

  it("breaks a lock held over two hours though its pid runs (reused, or hung)", async () => {
    const dir = lockDir();
    mkdirSync(dir);
    const since = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    writeFileSync(
      path.join(dir, "owner.json"),
      JSON.stringify({ pid: 1, worktree: "/w/old", what: "e2e", since }),
    );
    const result = await withHeavyLock(dir, me, () => "ran", { pollMs: 10, isAlive: () => true });
    expect(result).toBe("ran");
  });

  it("breaks a lock with no owner written after a few polls", async () => {
    const dir = lockDir();
    mkdirSync(dir);
    expect(await withHeavyLock(dir, me, () => "ran", { pollMs: 10 })).toBe("ran");
  });
});
