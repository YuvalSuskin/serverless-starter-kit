import { beadPrefix, DEFAULT_PREFIX } from "@acme/sweep/prefix";
import path from "node:path";

import type { GitContext } from "./git.ts";

import { git, listWorktrees, refExists, toplevel } from "./git.ts";

type TargetKind =
  | { id: string; kind: "bead" }
  | { kind: "current" }
  | { kind: "name"; value: string }
  | { kind: "pr"; number: number };

type Resolution =
  | { bead: string | undefined; branch: string; kind: "branch" }
  | { kind: "error"; message: string }
  | { kind: "worktree"; path: string };

interface BeadJson {
  external_ref?: null | string;
  id: string;
  issue_type?: string;
  metadata?: null | Record<string, unknown>;
  title?: string;
}

// "<prefix>-5ss.1", "<prefix>-0f3": the prefix, a short hash, child numbers.
// The prefix is what tells a bead from a hyphenated branch name like "my-branch".
const HASH = /^[a-z0-9]{3,8}(\.\d+)*$/;
const isBeadId = (input: string, prefix: string) =>
  input.startsWith(`${prefix}-`) && HASH.test(input.slice(prefix.length + 1));
const NOT_A_FEATURE = new Set(["HEAD", "main", "origin", "origin/HEAD", "origin/main"]);

export function classify(input: string, prefix: string = DEFAULT_PREFIX): TargetKind {
  if (input === ".") return { kind: "current" };
  const pr = /^#(\d+)$/.exec(input) ?? /\/pull\/(\d+)(?:\/|$)/.exec(input);
  if (pr?.[1] !== undefined) return { kind: "pr", number: Number(pr[1]) };
  if (isBeadId(input, prefix)) return { id: input, kind: "bead" };
  return { kind: "name", value: input };
}

const branch = (name: string, bead?: string): Resolution => ({
  bead,
  branch: name,
  kind: "branch",
});
const error = (message: string): Resolution => ({ kind: "error", message });

async function prBranch(n: number, ctx: GitContext): Promise<Resolution> {
  const result = await ctx.run("gh", ["pr", "view", String(n), "--json", "headRefName"], {
    cwd: ctx.cwd,
  });
  if (result.code === 127) {
    return error("PR targets need the GitHub CLI: brew install gh, then gh auth login.");
  }
  if (result.code !== 0)
    return error(`gh could not find PR #${String(n)}: ${result.stderr.trim()}`);
  return branch((JSON.parse(result.stdout) as { headRefName: string }).headRefName);
}

async function branchesMentioning(id: string, ctx: GitContext): Promise<string[]> {
  const needle = id.toLowerCase();
  const refs = await git(ctx, [
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads",
    "refs/remotes/origin",
  ]);
  const byName = refs.split("\n").filter((ref) => ref.toLowerCase().includes(needle));
  const commits = await git(ctx, ["log", "--all", "--format=%H", "-F", "--grep", id, "-n", "20"]);
  const byCommit: string[] = [];
  for (const sha of commits.split("\n").filter(Boolean)) {
    const containing = await git(ctx, [
      "branch",
      "--all",
      "--format=%(refname:short)",
      "--contains",
      sha,
    ]);
    byCommit.push(...containing.split("\n"));
  }
  const names = [...byName, ...byCommit]
    .filter(Boolean)
    .map((name) => name.replace(/^origin\//, ""))
    .filter((name) => !NOT_A_FEATURE.has(name));
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

async function epicChildren(id: string, ctx: GitContext): Promise<Resolution> {
  const listed = await ctx.run(
    "bd",
    ["list", "--parent", id, "--all", "--has-metadata-key", "branch", "--json"],
    { cwd: ctx.cwd },
  );
  const children = listed.code === 0 ? (JSON.parse(listed.stdout) as BeadJson[]) : [];
  if (children.length === 0)
    return error(`${id} is an epic, and none of its children has a branch.`);
  const lines = children.map((child) => `  ${child.id}  ${child.title ?? ""}`);
  return error(`${id} is an epic; preview one of its children:\n${lines.join("\n")}`);
}

/** undefined: bd has no such bead, so the input is treated as a name. */
async function beadBranch(id: string, ctx: GitContext): Promise<Resolution | undefined> {
  const shown = await ctx.run("bd", ["show", id, "--json"], { cwd: ctx.cwd });
  if (shown.code === 127) return error("Bead targets need beads (bd): brew install beads.");
  if (shown.code !== 0) return undefined;
  const parsed = JSON.parse(shown.stdout) as BeadJson | BeadJson[];
  const bead = Array.isArray(parsed) ? parsed[0] : parsed;
  if (bead === undefined) return undefined;
  if (bead.issue_type === "epic") return epicChildren(id, ctx);

  const recorded = bead.metadata?.branch;
  if (typeof recorded === "string" && recorded !== "") return branch(recorded, id);

  const pr = /^gh-(\d+)$/.exec(bead.external_ref ?? "");
  if (pr?.[1] !== undefined) {
    const viaPr = await prBranch(Number(pr[1]), ctx);
    return viaPr.kind === "branch" ? { ...viaPr, bead: id } : viaPr;
  }

  const found = await branchesMentioning(id, ctx);
  const [only] = found;
  if (found.length === 1 && only !== undefined) return branch(only, id);
  if (found.length > 1) {
    const lines = found.map((name) => "  " + name).join("\n");
    return error(`Several branches mention ${id}; preview one of them:\n${lines}`);
  }
  return error(
    `No branch is recorded for ${id}, and none mentions it. Record one with: bd update ${id} --set-metadata branch=<branch>`,
  );
}

async function nameBranch(value: string, ctx: GitContext): Promise<Resolution> {
  if (await refExists(ctx, `refs/heads/${value}`)) return branch(value);
  if (await refExists(ctx, `refs/remotes/origin/${value}`)) return branch(value);

  const matches = (await listWorktrees(ctx)).filter((tree) =>
    path.basename(tree.path).includes(value),
  );
  const [match] = matches;
  if (matches.length === 1 && match !== undefined) {
    return match.branch === undefined
      ? { kind: "worktree", path: match.path }
      : branch(match.branch);
  }
  if (matches.length > 1) {
    const lines = matches.map((tree) => "  " + tree.path).join("\n");
    return error(`Several worktrees match "${value}":\n${lines}`);
  }

  const fetched = await ctx.run("git", ["fetch", "origin", value], { cwd: ctx.cwd });
  if (fetched.code === 0 && (await refExists(ctx, `refs/remotes/origin/${value}`))) {
    return branch(value);
  }
  return error(
    `No branch, PR, bead or worktree matches "${value}". See what is running with: pnpm preview list`,
  );
}

export async function resolveTarget(input: string, ctx: GitContext): Promise<Resolution> {
  const target = classify(input, beadPrefix(ctx.cwd));
  switch (target.kind) {
    case "bead": {
      return (await beadBranch(target.id, ctx)) ?? nameBranch(target.id, ctx);
    }
    case "current": {
      return { kind: "worktree", path: await toplevel(ctx) };
    }
    case "name": {
      return nameBranch(target.value, ctx);
    }
    case "pr": {
      return prBranch(target.number, ctx);
    }
  }
}
