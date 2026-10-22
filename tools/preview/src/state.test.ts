import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { PreviewState } from "./state.ts";

import {
  clearState,
  ensurePreviewDir,
  markCreated,
  readLockHash,
  readState,
  wasCreatedByPreview,
  writeLockHash,
  writeState,
} from "./state.ts";

const dir = () => mkdtempSync(path.join(tmpdir(), "preview-state-"));

const STATE: PreviewState = {
  bead: "acme-abc",
  branch: "claude/a-111111",
  pids: { api: 11, web: 12 },
  ports: { api: 4301, web: 4300 },
  slug: "a",
  startedAt: "2026-09-26T10:00:00.000Z",
  target: "acme-abc",
  version: 1,
};

describe("state", () => {
  it("round-trips, and clearing forgets it", () => {
    const worktree = dir();
    writeState(worktree, STATE);
    expect(readState(worktree)).toEqual(STATE);
    clearState(worktree);
    expect(readState(worktree)).toBeUndefined();
  });

  it("ignores a state file it does not understand", () => {
    const worktree = dir();
    writeState(worktree, { ...STATE, version: 2 } as unknown as PreviewState);
    expect(readState(worktree)).toBeUndefined();
  });

  it("keeps .preview/ out of git on any branch, even one without the .gitignore line", () => {
    const worktree = dir();
    ensurePreviewDir(worktree);
    expect(readFileSync(path.join(worktree, ".preview/.gitignore"), "utf8")).toBe("*\n");
  });

  it("remembers that preview created the worktree, across stop and start", () => {
    const worktree = dir();
    expect(wasCreatedByPreview(worktree)).toBe(false);
    markCreated(worktree);
    writeState(worktree, STATE);
    clearState(worktree);
    expect(wasCreatedByPreview(worktree)).toBe(true);
  });

  it("remembers the lockfile hash of the last install", () => {
    const worktree = dir();
    expect(readLockHash(worktree)).toBeUndefined();
    writeLockHash(worktree, "abc");
    expect(readLockHash(worktree)).toBe("abc");
  });
});
