import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { writeLockHash } from "./state.ts";
import { scriptedRunner, tempRepo } from "./testing.ts";
import { copyIncludes, ensureWorktree, lockHash, needsInstall } from "./worktrees.ts";

/** ensureWorktree for tests that expect a worktree, not a reason there is none. */
async function worktreeOf(...args: Parameters<typeof ensureWorktree>) {
  const tree = await ensureWorktree(...args);
  if (typeof tree === "string") throw new Error(tree);
  return tree;
}

describe("ensureWorktree", () => {
  it("reuses the worktree that already has the branch", async () => {
    const repo = tempRepo();
    const tree = path.join(repo.root, ".claude/worktrees/agent");
    repo.git(["worktree", "add", "-b", "claude/agent-111111", tree]);
    const ctx = { cwd: repo.root, run: scriptedRunner({}) };
    expect(await ensureWorktree("claude/agent-111111", "agent", ctx)).toEqual({
      created: false,
      path: tree,
    });
  });

  it("creates .claude/worktrees/preview-<slug> for a local branch", async () => {
    const repo = tempRepo();
    repo.git(["branch", "claude/new-222222"]);
    const ctx = { cwd: repo.root, run: scriptedRunner({}) };
    const tree = await worktreeOf("claude/new-222222", "new", ctx);
    expect(tree).toEqual({
      created: true,
      path: path.join(repo.root, ".claude/worktrees/preview-new"),
    });
    expect(repo.git(["branch", "--show-current"], tree.path)).toBe("claude/new-222222");
  });

  it("creates a tracking branch for a branch that only exists on origin", async () => {
    const repo = tempRepo();
    repo.git(["push", "origin", "main:remote-only"]);
    repo.git(["fetch", "origin"]);
    const ctx = { cwd: repo.root, run: scriptedRunner({}) };
    const tree = await worktreeOf("remote-only", "remote-only", ctx);
    expect(repo.git(["rev-parse", "--abbrev-ref", "@{u}"], tree.path)).toBe("origin/remote-only");
  });
});

describe("ensureWorktree for a branch this machine has not fetched", () => {
  it("fetches it from origin first", async () => {
    const repo = tempRepo();
    repo.git(["push", "origin", "main:claude/cloud-333333"]);
    repo.git(["update-ref", "-d", "refs/remotes/origin/claude/cloud-333333"]);
    const ctx = { cwd: repo.root, run: scriptedRunner({}) };
    const tree = await ensureWorktree("claude/cloud-333333", "cloud", ctx);
    expect(tree).toMatchObject({ created: true });
    expect(typeof tree !== "string" && repo.git(["branch", "--show-current"], tree.path)).toBe(
      "claude/cloud-333333",
    );
  });

  it("says so, instead of throwing, when the branch is on neither", async () => {
    const repo = tempRepo();
    const ctx = { cwd: repo.root, run: scriptedRunner({}) };
    expect(await ensureWorktree("claude/nowhere-444444", "nowhere", ctx)).toMatch(
      /claude\/nowhere-444444 is not on this machine or on origin/,
    );
  });
});

describe("copyIncludes", () => {
  it("copies gitignored files that .worktreeinclude names and the worktree lacks", async () => {
    const repo = tempRepo();
    repo.commit(".gitignore", ".env*\n", "ignore env");
    repo.commit(".worktreeinclude", ".env\n.env.local\nREADME.md\n", "include env");
    writeFileSync(path.join(repo.root, ".env"), "A=1\n");
    writeFileSync(path.join(repo.root, ".env.local"), "B=2\n");
    const tree = path.join(repo.root, ".claude/worktrees/w");
    repo.git(["worktree", "add", "-b", "w", tree]);
    writeFileSync(path.join(tree, ".env.local"), "B=mine\n");

    const ctx = { cwd: repo.root, run: scriptedRunner({}) };
    expect(await copyIncludes(repo.root, tree, ctx)).toEqual([".env"]);
    expect(readFileSync(path.join(tree, ".env"), "utf8")).toBe("A=1\n");
    // Never overwrites, and never copies a tracked file.
    expect(readFileSync(path.join(tree, ".env.local"), "utf8")).toBe("B=mine\n");
  });

  it("does nothing without a .worktreeinclude, or in the main checkout", async () => {
    const repo = tempRepo();
    const ctx = { cwd: repo.root, run: scriptedRunner({}) };
    expect(await copyIncludes(repo.root, repo.root, ctx)).toEqual([]);
    const tree = path.join(repo.root, ".claude/worktrees/w");
    repo.git(["worktree", "add", "-b", "w", tree]);
    expect(await copyIncludes(repo.root, tree, ctx)).toEqual([]);
  });
});

describe("needsInstall", () => {
  it("installs when node_modules is missing or the lockfile changed", () => {
    const repo = tempRepo();
    writeFileSync(path.join(repo.root, "pnpm-lock.yaml"), "lock: 1\n");
    expect(needsInstall(repo.root, lockHash(repo.root))).toBe(true);
    mkdirSync(path.join(repo.root, "node_modules"));
    expect(needsInstall(repo.root, lockHash(repo.root))).toBe(false);
    writeLockHash(repo.root, lockHash(repo.root));
    writeFileSync(path.join(repo.root, "pnpm-lock.yaml"), "lock: 2\n");
    expect(needsInstall(repo.root, "stale")).toBe(true);
    expect(existsSync(path.join(repo.root, ".preview"))).toBe(true);
  });
});
