import { existsSync, mkdirSync, mkdtempSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { withLock } from "./lock.ts";

const lockDir = () => path.join(mkdtempSync(path.join(tmpdir(), "preview-lock-")), "preview.lock");

describe("withLock", () => {
  it("runs one holder at a time: the second waits for the first", async () => {
    const dir = lockDir();
    const order: string[] = [];
    let release: () => void = () => undefined;
    const first = withLock(dir, async () => {
      order.push("first in");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      order.push("first out");
    });
    const second = withLock(dir, () => {
      order.push("second in");
      return Promise.resolve();
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(order).toEqual(["first in"]);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["first in", "first out", "second in"]);
    expect(existsSync(dir)).toBe(false);
  });

  it("releases the lock when the holder throws", async () => {
    const dir = lockDir();
    await expect(withLock(dir, () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(existsSync(dir)).toBe(false);
  });

  it("breaks a lock left behind by a crashed run", async () => {
    const dir = lockDir();
    mkdirSync(dir);
    const old = new Date(Date.now() - 10 * 60_000);
    utimesSync(dir, old, old);
    expect(await withLock(dir, () => Promise.resolve("ran"))).toBe("ran");
  });

  it("gives up with a clear message when another run holds it too long", async () => {
    const dir = lockDir();
    mkdirSync(dir);
    await expect(withLock(dir, () => Promise.resolve(), { waitMs: 300 })).rejects.toThrow(
      /Another pnpm preview/,
    );
  });
});
