import path from "node:path";

import type { Runner } from "./run.ts";

export interface GitContext {
  cwd: string;
  run: Runner;
}

interface Worktree {
  /** undefined on a detached HEAD. */
  branch: string | undefined;
  path: string;
}

/** Parses `git worktree list --porcelain`. */
export function parseWorktrees(porcelain: string): Worktree[] {
  return porcelain
    .split(/\n\n+/)
    .map((block) => block.split("\n"))
    .flatMap((lines) => {
      const worktree = lines.find((line) => line.startsWith("worktree "));
      if (worktree === undefined) return [];
      const branch = lines.find((line) => line.startsWith("branch refs/heads/"));
      return [
        {
          branch: branch?.slice("branch refs/heads/".length),
          path: worktree.slice("worktree ".length),
        },
      ];
    });
}

export async function git(
  ctx: GitContext,
  args: readonly string[],
  cwd = ctx.cwd,
): Promise<string> {
  const result = await ctx.run("git", args, { cwd });
  if (result.code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

export async function listWorktrees(ctx: GitContext): Promise<Worktree[]> {
  return parseWorktrees(await git(ctx, ["worktree", "list", "--porcelain"]));
}

/** The repository's shared .git directory, the same from every worktree. */
export async function gitCommonDir(ctx: GitContext): Promise<string> {
  return git(ctx, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
}

/** The main checkout's root, from anywhere inside the repo or its worktrees. */
export async function mainRoot(ctx: GitContext): Promise<string> {
  return path.dirname(await gitCommonDir(ctx));
}

export async function toplevel(ctx: GitContext): Promise<string> {
  return git(ctx, ["rev-parse", "--show-toplevel"]);
}

export async function refExists(ctx: GitContext, ref: string, cwd = ctx.cwd): Promise<boolean> {
  return (await ctx.run("git", ["rev-parse", "--verify", "--quiet", ref], { cwd })).code === 0;
}

export async function currentBranch(ctx: GitContext, cwd: string): Promise<string | undefined> {
  const branch = await git(ctx, ["branch", "--show-current"], cwd);
  return branch === "" ? undefined : branch;
}
