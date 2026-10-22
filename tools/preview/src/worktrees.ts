import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { GitContext } from "./git.ts";

import { git, listWorktrees, mainRoot, refExists } from "./git.ts";

interface PreparedWorktree {
  created: boolean;
  path: string;
}

/**
 * The worktree that has the branch, or a new one under .claude/worktrees/,
 * fetching the branch first when this machine has not seen it (a PR
 * from a cloud session, say). A string explains why there is none.
 */
export async function ensureWorktree(
  branch: string,
  slug: string,
  ctx: GitContext,
): Promise<PreparedWorktree | string> {
  const existing = (await listWorktrees(ctx)).find((tree) => tree.branch === branch);
  if (existing !== undefined) return { created: false, path: existing.path };

  const root = await mainRoot(ctx);
  const target = path.join(root, ".claude", "worktrees", `preview-${slug}`);
  if (await refExists(ctx, `refs/heads/${branch}`, root)) {
    await git(ctx, ["worktree", "add", target, branch], root);
    return { created: true, path: target };
  }
  const remote = `refs/remotes/origin/${branch}`;
  if (!(await refExists(ctx, remote, root))) {
    await ctx.run("git", ["fetch", "origin", branch], { cwd: root });
    if (!(await refExists(ctx, remote, root))) {
      return `${branch} is not on this machine or on origin.`;
    }
  }
  await git(ctx, ["worktree", "add", "--track", "-b", branch, target, `origin/${branch}`], root);
  return { created: true, path: target };
}

/**
 * Copies the gitignored files that .worktreeinclude names (gitignore syntax,
 * as in Claude Code) from the main checkout, when the worktree lacks them.
 */
export async function copyIncludes(
  root: string,
  worktree: string,
  ctx: GitContext,
): Promise<string[]> {
  if (root === worktree || !existsSync(path.join(root, ".worktreeinclude"))) return [];
  const named = (
    await git(ctx, ["ls-files", "--others", "--ignored", "--exclude-from=.worktreeinclude"], root)
  )
    .split("\n")
    .filter(Boolean);
  if (named.length === 0) return [];
  const ignored = await ctx.run("git", ["check-ignore", "--", ...named], { cwd: root });
  const copied: string[] = [];
  for (const relative of ignored.stdout.split("\n").filter(Boolean)) {
    const destination = path.join(worktree, relative);
    if (existsSync(destination)) continue;
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(root, relative), destination);
    copied.push(relative);
  }
  return copied;
}

export function lockHash(worktree: string): string {
  const lockfile = path.join(worktree, "pnpm-lock.yaml");
  if (!existsSync(lockfile)) return "no-lockfile";
  return createHash("sha256").update(readFileSync(lockfile)).digest("hex");
}

export function needsInstall(worktree: string, recorded: string | undefined): boolean {
  return !existsSync(path.join(worktree, "node_modules")) || recorded !== lockHash(worktree);
}
