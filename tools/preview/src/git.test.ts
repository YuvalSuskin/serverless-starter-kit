import { describe, expect, it } from "vitest";

import { parseWorktrees } from "./git.ts";

describe("parseWorktrees", () => {
  it("reads branches, detached heads and paths with spaces", () => {
    const porcelain = [
      "worktree /repo",
      "HEAD 1111111111111111111111111111111111111111",
      "branch refs/heads/main",
      "",
      "worktree /repo/.claude/worktrees/my tree",
      "HEAD 2222222222222222222222222222222222222222",
      "detached",
      "",
    ].join("\n");
    expect(parseWorktrees(porcelain)).toEqual([
      { branch: "main", path: "/repo" },
      { branch: undefined, path: "/repo/.claude/worktrees/my tree" },
    ]);
  });
});
