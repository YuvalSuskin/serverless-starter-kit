// pnpm merge-gate <pr> (CI decisions CI18): whether a ready PR may be merged
// into main now, and the exact command to merge it. Two PRs each proven green
// can still break main together (#134 after #139, 2026-10-16: a fixture of
// one lacked the required fields the other added, in files they did not
// share). So when main moved since the head's base, the merge result is
// built in a throwaway worktree and the cheap checks that span packages run
// on it: those of the packages both sides affect, then the repo-wide ones.
// It never merges, pushes or posts anything; it only says.
import path from "node:path";

import type { Run, Stream } from "./exec.ts";

import { PROOF_CONTEXT, PROOF_JOB } from "./github.ts";
import { type LockOptions, withHeavyLock } from "./lock.ts";
import { nodeProblem } from "./node-pin.ts";
import { type Suite, SWEEP_LINT, TRUTH_TEST, turbo } from "./plan.ts";

export interface GateDeps {
  run: Run;
  stream: Stream;
  /** The worktree it is run from: any checkout of this repo. */
  root: string;
  node: { version: string; pinned: string | undefined };
  log: (line: string) => void;
  /** Deletes a directory and all in it; nothing if it is not there. */
  removeDir: (dir: string) => void;
  /** Runs fn when the process exits, a kill included (realStream exits). */
  atExit: (fn: () => void) => void;
  lock?: LockOptions;
}

/** One entry of `gh pr view --json statusCheckRollup`. */
interface RollupItem {
  __typename?: string;
  name?: string;
  context?: string;
  status?: string;
  conclusion?: string | null;
  state?: string;
  startedAt?: string | null;
}

interface Pr {
  number: number;
  state: string;
  isDraft: boolean;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  mergeable: string;
  statusCheckRollup: RollupItem[];
}

type Judged = { ok: true; passed: string[] } | { ok: false; reason: string };

const PASSING_RUN = new Set(["SUCCESS", "SKIPPED"]);

const labelOf = (item: RollupItem) => item.context ?? item.name ?? "an unnamed check";

/** What is wrong with one check, or undefined when it passed or was skipped. */
function problemOf(item: RollupItem): string | undefined {
  const label = labelOf(item);
  if (item.__typename === "StatusContext") {
    return item.state === "SUCCESS" ? undefined : `${label} is ${item.state ?? "unknown"}`;
  }
  if (item.status !== "COMPLETED") return `${label} is still running`;
  const conclusion = item.conclusion ?? "";
  if (PASSING_RUN.has(conclusion)) return undefined;
  return `${label} ended ${conclusion === "" ? "without a conclusion" : conclusion}`;
}

/**
 * The newest run of each check, as the branch rule reads them: a run of an
 * older workflow run on the same head (a failed `proof` before the proof was
 * posted, then passed in a new run) is not the check's state.
 */
function newestPerCheck(rollup: RollupItem[]): RollupItem[] {
  const newest = new Map<string, RollupItem>();
  for (const item of rollup) {
    const key = `${item.__typename ?? ""}:${labelOf(item)}`;
    const kept = newest.get(key);
    if (kept === undefined || (item.startedAt ?? "") >= (kept.startedAt ?? "")) {
      newest.set(key, item);
    }
  }
  return [...newest.values()];
}

/**
 * Every check on the head passed or was skipped, and the two main's branch
 * rule requires passed (CI17): the proof, and the `proof` job, which GitHub
 * also counts as passed when it was skipped on a draft.
 */
export function judgeChecks(all: RollupItem[]): Judged {
  const rollup = newestPerCheck(all);
  const problems = rollup.map(problemOf).filter((p) => p !== undefined);
  const passed = [
    ...new Set(rollup.filter((i) => problemOf(i) === undefined).map((i) => labelOf(i))),
  ];
  const seen = new Set(rollup.map((i) => labelOf(i)));
  // Each of the two the branch rule requires, unless a problem above named it.
  if (!seen.has(PROOF_CONTEXT)) problems.push(`no ${PROOF_CONTEXT} proof on this head`);
  const jobPassed = rollup.some(
    (i) => labelOf(i) === PROOF_JOB && i.status === "COMPLETED" && i.conclusion === "SUCCESS",
  );
  if (!seen.has(PROOF_JOB)) problems.push(`the ${PROOF_JOB} job has not run on this head`);
  else if (!jobPassed && passed.includes(PROOF_JOB)) {
    problems.push(`the ${PROOF_JOB} job was only skipped, as on a draft, so it has not passed`);
  }
  return problems.length === 0 ? { ok: true, passed } : { ok: false, reason: problems.join("; ") };
}

/**
 * The packages that both sides of the merge affect (turbo's, dependents
 * included, plus those whose tasks read a file the side changed outside
 * their folder: rootReaders). Only these can break in the merge: a package only one side
 * affects has the same files and dependencies in the merge as on that side,
 * where they passed (the PR's proof, or main's own merge gate).
 */
export function bothAffect(prSide: string[], mainSide: string[]): string[] {
  return prSide.filter((p) => mainSide.includes(p)).sort((x, y) => x.localeCompare(y));
}

/**
 * check:push's suites for those packages, then the two checks that read the
 * whole repo, which turbo places in no package. Not the contract, bundle or
 * e2e tests: they are the minutes of a full run, and a merge that breaks only
 * them is the residual risk CI18 accepts.
 */
export function mergeSuites(both: string[]): Suite[] {
  if (both.length === 0) return [SWEEP_LINT, TRUTH_TEST];
  const suites: Suite[] = [
    {
      name: "format, lint, types, knip",
      ...turbo("format", "lint", "typecheck", "knip", ...both.map((p) => `--filter=${p}`)),
      heavy: false,
    },
  ];
  // The root (`//`) has only its format task; its `test` script is turbo itself.
  const packages = both.filter((p) => p !== ROOT);
  if (packages.length > 0) {
    suites.push({
      // One package at a time, holding the machine-wide lock, as check:push.
      name: "unit and browser tests",
      ...turbo("test", ...packages.map((p) => `--filter=${p}`), "--concurrency=1"),
      heavy: true,
    });
  }
  return [...suites, SWEEP_LINT, TRUTH_TEST];
}

const ROOT = "//";

/** A package whose tasks read files outside it (turbo.json's inputs). */
interface Reader {
  name: string;
  include: RegExp[];
  exclude: RegExp[];
}

/** A turbo input glob, relative to the repo root, as a RegExp. */
function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob.charAt(i);
    if (c === "*" && glob.charAt(i + 1) === "*") {
      const slash = glob.charAt(i + 2) === "/";
      re += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/**
 * The packages whose tasks read files outside their own folder: inputs under
 * `$TURBO_ROOT$/` (the backend's tests read docs/, sweep's every .md), and the
 * root's own tasks (`//#format`). turbo's --affected places a changed file in
 * the package whose folder holds it only, so these are added by hand.
 */
export function rootReaders(turboJson: string): Reader[] {
  const tasks = (JSON.parse(turboJson) as { tasks?: Record<string, { inputs?: string[] }> }).tasks;
  const readers = new Map<string, Reader>();
  for (const [key, task] of Object.entries(tasks ?? {})) {
    const at = key.lastIndexOf("#");
    if (at <= 0) continue;
    const name = key.slice(0, at);
    const reader = readers.get(name) ?? { name, include: [], exclude: [] };
    addInputs(reader, task.inputs ?? [], name === ROOT ? "" : "$TURBO_ROOT$/");
    if (reader.include.length > 0) readers.set(name, reader);
  }
  return [...readers.values()];
}

/** A task's inputs outside its package: those under prefix, the rest skipped. */
function addInputs(reader: Reader, inputs: string[], prefix: string): void {
  for (const input of inputs) {
    const negated = input.startsWith("!");
    const glob = negated ? input.slice(1) : input;
    if (glob.startsWith("$TURBO_DEFAULT$") || !glob.startsWith(prefix)) continue;
    (negated ? reader.exclude : reader.include).push(globToRegExp(glob.slice(prefix.length)));
  }
}

/** The readers some changed file is an input of. */
export function packagesReading(files: string[], readers: Reader[]): string[] {
  return readers
    .filter((r) =>
      files.some((f) => r.include.some((re) => re.test(f)) && !r.exclude.some((re) => re.test(f))),
    )
    .map((r) => r.name);
}

// A commit only this machine sees; any identity will do.
const MERGE_IDENTITY = {
  GIT_AUTHOR_NAME: "merge-gate",
  GIT_AUTHOR_EMAIL: "merge-gate@acme.invalid",
  GIT_COMMITTER_NAME: "merge-gate",
  GIT_COMMITTER_EMAIL: "merge-gate@acme.invalid",
};

function affected(d: GateDeps, dir: string, base: string, head: string): string[] {
  const out = d.run("pnpm", ["exec", "turbo", "ls", "--affected", "--output=json"], {
    cwd: dir,
    env: { TURBO_SCM_BASE: base, TURBO_SCM_HEAD: head },
  });
  const parsed = JSON.parse(out) as { packages: { items: { name: string }[] } };
  return parsed.packages.items.map((p) => p.name);
}

const short = (sha: string) => sha.slice(0, 10);

const PR_FIELDS =
  "number,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,statusCheckRollup";

/** Why GitHub's view of the PR blocks the merge, or undefined when it does not. */
function prProblem(d: GateDeps, pr: Pr): string | undefined {
  if (pr.state !== "OPEN") return `the PR is ${pr.state}, not open.`;
  if (pr.isDraft) return "the PR is a draft: pnpm check:full --ready marks it ready.";
  if (pr.baseRefName !== "main") return `the PR is into ${pr.baseRefName}, not main.`;
  const checks = judgeChecks(pr.statusCheckRollup);
  if (!checks.ok) return `${checks.reason}.`;
  d.log(`merge-gate: checks on the head passed: ${checks.passed.join(", ")}`);
  if (pr.mergeable === "CONFLICTING") {
    return "GitHub says the PR conflicts with main: merge origin/main into the branch.";
  }
  return undefined;
}

interface Merge {
  n: string;
  head: string;
  main: string;
  base: string;
  /** The local merge commit, and the git data every worktree shares. */
  commit: string;
  common: string;
}

/** Checks the merge in a throwaway worktree: why it fails, or undefined. */
async function checkMerge(d: GateDeps, m: Merge): Promise<string | undefined> {
  const git = (...args: string[]) => d.run("git", args, { cwd: d.root }).trim();
  // Beside the agents' worktrees, in the main checkout's ignored folder.
  const dir = path.join(path.dirname(m.common), ".claude", "worktrees", `merge-gate-pr${m.n}`);
  const removeWorktree = () => {
    try {
      git("worktree", "remove", "--force", dir);
    } catch {
      // Not a worktree (any more); the directory goes below.
    }
    d.removeDir(dir);
    try {
      git("worktree", "prune");
    } catch {
      // Pruning is housekeeping.
    }
  };
  let removed = false;
  const cleanUp = () => {
    if (removed) return;
    removed = true;
    removeWorktree();
  };
  d.atExit(cleanUp);
  // A run killed before its cleanup leaves its worktree: remove it first.
  removeWorktree();
  git("worktree", "add", "--detach", dir, m.commit);
  try {
    d.log(`merge-gate: merge result ${short(m.commit)} in ${dir}`);
    const install = ["install", "--frozen-lockfile", "--prefer-offline"];
    if ((await d.stream("pnpm", install, { cwd: dir })) !== 0) {
      return "pnpm install failed in the merge result.";
    }
    const readers = rootReaders(git("show", `${m.commit}:turbo.json`));
    const side = (to: string) => [
      ...new Set([
        ...affected(d, dir, m.base, to),
        ...packagesReading(git("diff", "--name-only", m.base, to).split("\n"), readers),
      ]),
    ];
    const both = bothAffect(side(m.head), side(m.main));
    d.log(
      both.length === 0
        ? "merge-gate: no package is affected by both sides; the repo-wide checks only."
        : `merge-gate: packages both sides affect: ${both.join(", ")}`,
    );
    for (const suite of mergeSuites(both)) {
      d.log(`\nmerge-gate: ${suite.name}`);
      const go = () => d.stream(suite.cmd, suite.args, { cwd: dir, env: suite.env });
      const code = suite.heavy
        ? await withHeavyLock(
            path.join(m.common, "acme", "heavy.lock"),
            { worktree: dir, what: `merge-gate #${m.n}: ${suite.name}` },
            go,
            { log: d.log, ...d.lock },
          )
        : await go();
      if (code !== 0) {
        return (
          `${suite.name} failed on the merge of the head into main. The PR breaks main once ` +
          "merged: merge origin/main into the branch, fix, pnpm check:full, push, then run " +
          `pnpm merge-gate ${m.n} again.`
        );
      }
    }
    return undefined;
  } finally {
    cleanUp();
  }
}

/** `pnpm merge-gate <pr>`: 0 when the PR may be merged now, 1 when not. */
export async function mergeGate(d: GateDeps, number: number): Promise<number> {
  const n = String(number);
  const blocked = (reason: string) => {
    d.log(`merge-gate: BLOCKED: ${reason}`);
    return 1;
  };
  const wrongNode = nodeProblem({ pinned: d.node.pinned, actual: d.node.version });
  if (wrongNode !== undefined) {
    d.log(wrongNode);
    return 1;
  }
  const git = (args: string[], env?: Record<string, string>) =>
    d.run("git", args, { cwd: d.root, env }).trim();

  const pr = JSON.parse(d.run("gh", ["pr", "view", n, "--json", PR_FIELDS], { cwd: d.root })) as Pr;
  const head = pr.headRefOid;
  d.log(`merge-gate: PR #${n} (${pr.headRefName}), head ${short(head)}`);
  const problem = prProblem(d, pr);
  if (problem !== undefined) return blocked(problem);

  git(["fetch", "--no-tags", "--quiet", "origin", `refs/pull/${n}/head`]);
  if (git(["rev-parse", "FETCH_HEAD"]) !== head) {
    return blocked("the head moved while this ran; run pnpm merge-gate again.");
  }
  git(["fetch", "--no-tags", "--quiet", "origin", "+refs/heads/main:refs/remotes/origin/main"]);
  const main = git(["rev-parse", "refs/remotes/origin/main"]);
  const pass = (why: string) => {
    d.log(`merge-gate: PASS: ${why}. Merge with:`);
    d.log(`  gh pr merge ${n} --squash --match-head-commit ${head}`);
    d.log(
      `  (Checked against origin/main at ${short(main)}: if main moves before you merge, ` +
        `run pnpm merge-gate ${n} again.)`,
    );
    return 0;
  };

  try {
    git(["merge-base", "--is-ancestor", main, head]);
    return pass("the head contains origin/main, so the squash's tree is the proven tree");
  } catch {
    // main moved since the head's base: the merged tree is not the proven one.
  }
  const base = git(["merge-base", main, head]);
  const moved = git(["rev-list", "--count", `${base}..${main}`]);
  d.log(
    `merge-gate: main moved ${moved} commit${moved === "1" ? "" : "s"} since the head's ` +
      `base (${short(base)}): checking the merge result.`,
  );
  let tree: string;
  try {
    tree = (git(["merge-tree", "--write-tree", main, head]).split("\n")[0] ?? "").trim();
  } catch {
    return blocked("the PR conflicts with main: merge origin/main into the branch and resolve.");
  }
  const commit = git(
    ["commit-tree", tree, "-p", main, "-p", head, "-m", `merge-gate: #${n} onto main`],
    MERGE_IDENTITY,
  );
  const common = path.resolve(d.root, git(["rev-parse", "--git-common-dir"]));
  const failed = await checkMerge(d, { n, head, main, base, commit, common });
  if (failed !== undefined) return blocked(failed);
  return pass("the merge result passed the checks across packages");
}
