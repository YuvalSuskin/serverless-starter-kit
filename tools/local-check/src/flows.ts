// The three things local-check does: the pre-push check, `pnpm check:full`,
// and posting the proof once a pushed commit reaches GitHub. Everything they
// touch comes in through Deps, so the tests run them with fakes.
import path from "node:path";

import type { Run, Stream } from "./exec.ts";

import {
  githubSlug,
  onGitHub,
  postProof,
  PROOF_CONTEXT,
  prState,
  repoSlug,
  rerunWaitingRuns,
} from "./github.ts";
import { type LockOptions, withHeavyLock } from "./lock.ts";
import { majorOf, nodeProblem } from "./node-pin.ts";
import { type Host, type Level, plan, workersFrom } from "./plan.ts";
import { describePass, type PassRecord, readPass, writePass } from "./record.ts";

export interface Deps {
  run: Run;
  stream: Stream;
  /** The worktree's root. */
  root: string;
  host: Host;
  env: Record<string, string | undefined>;
  /** process.version of this shell's Node, and .nvmrc's text (CI16). */
  node: { version: string; pinned: string | undefined };
  log: (line: string) => void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Starts `post` for the commit in the background, to outlive the push. */
  postLater: (sha: string) => void;
  lock?: LockOptions;
}

interface Repo {
  head: string;
  branch: string;
  /** The git data every worktree shares: where the lock and records live. */
  shared: string;
  base: string | undefined;
  /** Why every package counts as changed (no main to measure from), if it does. */
  everything: string | undefined;
  dirty: boolean;
}

function repo(d: Deps): Repo {
  const git = (...args: string[]) => d.run("git", args, { cwd: d.root }).trim();
  let base: string | undefined;
  // With no main to measure from, turbo's own default (a local main, often
  // HEAD itself) would select nothing and the run would check nothing:
  // every package counts as changed instead.
  let everything: string | undefined;
  try {
    base = git("merge-base", "HEAD", "origin/main");
  } catch {
    everything = "no origin/main"; // a new project with no GitHub repository yet
  }
  const head = git("rev-parse", "HEAD");
  // A commit already on main (a squash commit proven for its release, CI19)
  // is its own merge base, so nothing would be affected and the run would
  // check nothing: measure it from its first parent, the main it was made on.
  if (base === head) {
    try {
      base = git("rev-parse", "--verify", "--quiet", "HEAD^");
    } catch {
      base = undefined;
      everything = "the root commit";
    }
  }
  return {
    head,
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    shared: path.resolve(d.root, git("rev-parse", "--git-common-dir"), "acme"),
    base,
    everything,
    dirty: git("status", "--porcelain", "--untracked-files=normal") !== "",
  };
}

const recordsDir = (r: Repo) => path.join(r.shared, "check-full");

/** The changed packages, or every package when there is no main to measure from. */
function affected(d: Deps, r: Repo): string[] {
  const args = r.everything === undefined ? ["ls", "--affected"] : ["ls"];
  const out = d.run("pnpm", ["exec", "turbo", ...args, "--output=json"], {
    cwd: d.root,
    env: { TURBO_SCM_BASE: r.base },
  });
  const parsed = JSON.parse(out) as { packages: { items: { name: string }[] } };
  return parsed.packages.items.map((p) => p.name);
}

type SuitesResult = { ok: true; record: PassRecord } | { ok: false; failed: string };

async function runSuites(d: Deps, r: Repo, level: Level): Promise<SuitesResult> {
  const started = d.now();
  if (r.everything !== undefined) {
    d.log(`local-check: ${r.everything}: every package counts as changed.`);
  }
  const scope = r.everything === undefined ? "affected" : "all";
  const p = plan(level, affected(d, r), d.host, workersFrom(d.env), scope);
  for (const line of p.notRun) d.log(`local-check: not run: ${line}`);
  for (const suite of p.suites) {
    d.log(`\nlocal-check: ${suite.name}`);
    const go = () =>
      d.stream(suite.cmd, suite.args, {
        cwd: d.root,
        env: { TURBO_SCM_BASE: r.base, ...suite.env },
      });
    const code = suite.heavy
      ? await withHeavyLock(
          path.join(r.shared, "heavy.lock"),
          { worktree: d.root, what: suite.name },
          go,
          { log: d.log, ...d.lock },
        )
      : await go();
    if (code !== 0) return { ok: false, failed: suite.name };
  }
  // A full run takes many minutes; what passed is the commit it started on
  // only if the worktree still holds exactly that. (The push level proves
  // nothing, and checks uncommitted work too, as the hook says.)
  const after = level === "full" ? repo(d) : r;
  if (after.head !== r.head || (level === "full" && after.dirty)) {
    return { ok: false, failed: `the worktree (it changed during the run, so it proves nothing)` };
  }
  return {
    ok: true,
    record: {
      sha: r.head,
      passedAt: new Date(d.now()).toISOString(),
      seconds: Math.round((d.now() - started) / 1000),
      suites: p.suites.map((s) => s.name),
      notRun: p.notRun,
      node: majorOf(d.node.version),
      e2e: {
        production: p.suites.find((s) => s.e2e?.build === "production")?.e2e?.projects ?? [],
      },
    },
  };
}

/** Posts the proof for a commit on GitHub and re-runs what waited for it. */
function publish(d: Deps, slug: string, record: PassRecord): void {
  postProof(d.run, slug, record.sha, describePass(record));
  d.log(`local-check: proof posted on ${record.sha.slice(0, 10)} (status ${PROOF_CONTEXT})`);
  const { rerun, failed } = rerunWaitingRuns(d.run, slug, record.sha);
  for (const id of rerun)
    d.log(`local-check: re-running CI run ${String(id)}, which waited for it`);
  for (const id of failed)
    d.log(`local-check: could not re-run CI run ${String(id)}; re-run its failed jobs by hand`);
}

const DIRTY =
  "local-check: commit first: pnpm check:full checks a commit, and this worktree has changes " +
  "(untracked files count: a test not added is not in the commit the proof names).";

/**
 * The pre-push hook's check (`pnpm check:push`). The fast suites always; on a
 * branch whose PR is ready for review, whose head needs the proof (CI17),
 * pnpm check:full too, unless that commit already passed it.
 */
export async function prePush(d: Deps): Promise<number> {
  const r = repo(d);
  const wrongNode = nodeProblem({ pinned: d.node.pinned, actual: d.node.version });
  if (wrongNode !== undefined) {
    d.log(`${wrongNode}\n  (A warning: this check goes on, but pnpm check:full would refuse.)\n`);
  }
  const fast = await runSuites(d, r, "push");
  if (!fast.ok) {
    d.log(`local-check: ${fast.failed} failed.`);
    return 1;
  }
  const pr = prState(d.run, d.root, r.branch);
  if (pr.kind === "unknown") {
    d.log(`local-check: could not ask GitHub about this branch's PR (${pr.reason}).`);
    d.log("  If it is ready for review, run pnpm check:full: its proof job needs the proof.");
  }
  const ready = pr.kind === "pr" && pr.open && !pr.draft;
  if (ready && readPass(recordsDir(r), r.head) === undefined) {
    d.log(
      `\nlocal-check: PR #${String(pr.number)} is ready for review, so this commit needs the proof.`,
    );
    if (wrongNode !== undefined) {
      d.log("  pnpm check:full refuses on this Node, so this push stops.");
      return 1;
    }
    d.log("  Running pnpm check:full first (next time, run it before pushing).");
    if (r.dirty) {
      d.log(DIRTY);
      return 1;
    }
    const full = await runSuites(d, r, "full");
    if (!full.ok) {
      d.log(`local-check: ${full.failed} failed.`);
      return 1;
    }
    writePass(recordsDir(r), full.record);
  }
  if (readPass(recordsDir(r), r.head) !== undefined) d.postLater(r.head);
  return 0;
}

/**
 * A new project before bootstrap step 3 has no GitHub repository: the pass is
 * recorded here, and the pre-push hook posts it once there is one to push to.
 */
function recordedOnly(d: Deps, ready: boolean): number {
  d.log("local-check: no GitHub remote: recorded, nothing posted.");
  if (!ready) return 0;
  d.log("local-check: no PR to mark ready: this repo has no GitHub remote yet.");
  return 1;
}

/** `pnpm check:full [--ready]`. */
export async function checkFull(d: Deps, opts: { ready: boolean }): Promise<number> {
  const wrongNode = nodeProblem({ pinned: d.node.pinned, actual: d.node.version });
  if (wrongNode !== undefined) {
    d.log(wrongNode);
    return 1;
  }
  const r = repo(d);
  if (r.dirty) {
    d.log(DIRTY);
    return 1;
  }
  let record = readPass(recordsDir(r), r.head);
  if (record === undefined) {
    const full = await runSuites(d, r, "full");
    if (!full.ok) {
      d.log(`\nlocal-check: ${full.failed} failed; nothing recorded.`);
      return 1;
    }
    record = full.record;
    writePass(recordsDir(r), record);
    d.log(`\nlocal-check: pnpm check:full ${describePass(record)}`);
  } else {
    d.log(
      `local-check: ${r.head.slice(0, 10)} already passed pnpm check:full (${record.passedAt}).`,
    );
  }
  const slug = githubSlug(d.run, d.root);
  if (slug === undefined) return recordedOnly(d, opts.ready);
  if (!onGitHub(d.run, slug, r.head)) {
    d.log("local-check: recorded. Push it: the pre-push hook posts the proof once the push lands.");
    if (opts.ready) d.log("  Then run pnpm check:full --ready again to mark the PR ready.");
    return 0;
  }
  publish(d, slug, record);
  if (opts.ready) {
    const pr = prState(d.run, d.root, r.branch);
    if (pr.kind !== "pr" || !pr.open) {
      d.log("local-check: no open PR for this branch to mark ready.");
      return 1;
    }
    if (pr.draft) {
      d.run("gh", ["pr", "ready", String(pr.number)], { cwd: d.root });
      d.log(
        `local-check: PR #${String(pr.number)} marked ready for review; its proof job runs once.`,
      );
    }
  }
  return 0;
}

/** Waits for a pushed commit to reach GitHub, then posts its proof. */
export async function postWhenPushed(d: Deps, sha: string, waitSeconds: number): Promise<number> {
  const r = repo(d);
  const record = readPass(recordsDir(r), sha);
  if (record === undefined) {
    d.log(`local-check: ${sha} has not passed pnpm check:full here; nothing to post.`);
    return 1;
  }
  const slug = repoSlug(d.run, d.root);
  const deadline = d.now() + waitSeconds * 1000;
  while (!onGitHub(d.run, slug, sha)) {
    if (d.now() > deadline) {
      d.log(
        `local-check: ${sha} did not reach GitHub in ${String(waitSeconds)}s; run pnpm check:full to post.`,
      );
      return 1;
    }
    await d.sleep(3000);
  }
  publish(d, slug, record);
  return 0;
}
