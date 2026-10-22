// The release check of deploy-production.yml (CI decisions CI19): production
// is deployed from one commit the owner names, never from whatever main holds.
// The workflow runs this from main's checkout, before it checks the release
// out: the commit must be on main's history and carry the local proof (CI17),
// and a run that applies must follow a passed plan of that same commit with no
// release since. Node built-ins only; git and gh through an injectable Run.
import type { Run } from "./exec.ts";

import { parseProof } from "./e2e-matrix.ts";
import { PROOF_CONTEXT } from "./github.ts";
import { majorOf } from "./node-pin.ts";

export type Verdict = { ok: true; reason: string } | { ok: false; reason: string };

/** At least 7 hex digits, at most a full sha; anything else is refused before git sees it. */
export function releaseInput(
  raw: string | undefined,
): { ok: true; sha: string } | { ok: false; reason: string } {
  const sha = (raw ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(sha)) {
    return {
      ok: false,
      reason: `"${(raw ?? "").trim()}" is not a commit sha: give the commit's sha (at least 7 hex characters)`,
    };
  }
  return { ok: true, sha };
}

export interface Status {
  context: string;
  state: string;
  description: string | null;
  /** Who posted it (its creator's login). */
  creator: string | null;
}

/** A pull request GitHub links to the commit (commits/{sha}/pulls). */
export interface Pull {
  number: number;
  base: string;
  merged: boolean;
  mergeCommit: string | null;
  headSha: string;
  /** The tree of the head commit; undefined when GitHub could not say. */
  headTree: string | undefined;
  /** The head's commit statuses, newest first. */
  headStatuses: Status[];
}

/**
 * The newest local/check-full status, if it passed on the Node the commit
 * pins and was posted by the owner's account (check:full posts with the gh
 * session of the machine that ran it): a status any token with statuses:
 * write could post, such as a workflow's, does not count.
 */
function proofIn(statuses: Status[], node: number | undefined, poster: string): Verdict {
  const proof = statuses.find((s) => s.context === PROOF_CONTEXT);
  if (proof === undefined) return { ok: false, reason: `no ${PROOF_CONTEXT} status` };
  if (proof.state !== "success") {
    return { ok: false, reason: `its ${PROOF_CONTEXT} status is ${proof.state}` };
  }
  if (proof.creator !== poster) {
    return {
      ok: false,
      reason: `its ${PROOF_CONTEXT} status was posted by ${proof.creator ?? "nobody known"}, not ${poster}`,
    };
  }
  if (node === undefined) return { ok: false, reason: "its .nvmrc cannot be read" };
  const ran = parseProof(proof.description ?? "").node;
  if (ran !== node) {
    return {
      ok: false,
      reason:
        ran === undefined
          ? `its proof does not say which Node it ran on (the commit pins Node ${String(node)})`
          : `its proof ran on Node ${String(ran)}, the commit pins Node ${String(node)}`,
    };
  }
  return { ok: true, reason: proof.description ?? PROOF_CONTEXT };
}

/**
 * Whether the release carries the local proof (CI17). A squash merge makes a
 * new commit on main that nobody ran check:full on, but its tree is the tree
 * of the pull request's head when the head contained main (CI18's fast path),
 * and a proof is about a tree: so the proof of the pull request that made the
 * commit counts when the two trees are the same. A commit's own proof (one
 * checked out from main and run by hand) counts as well: check:full measures
 * a commit already on main from its first parent (flows.ts), so that proof
 * covers the commit's own change.
 */
export function releaseProof(opts: {
  sha: string;
  tree: string;
  statuses: Status[];
  pulls: Pull[];
  /** The Node major the release pins (its .nvmrc). */
  node: number | undefined;
  /** The only account whose proof counts. */
  poster: string;
}): Verdict {
  const own = proofIn(opts.statuses, opts.node, opts.poster);
  if (own.ok) return { ok: true, reason: `the commit's own proof: ${own.reason}` };
  const reasons = [`the commit: ${own.reason}`];
  const made = opts.pulls.filter(
    (p) => p.merged && p.base === "main" && p.mergeCommit === opts.sha,
  );
  for (const pull of made) {
    const label = `#${String(pull.number)}'s head ${pull.headSha.slice(0, 10)}`;
    if (pull.headTree !== opts.tree) {
      reasons.push(`${label}: another tree (main moved before the merge)`);
      continue;
    }
    const head = proofIn(pull.headStatuses, opts.node, opts.poster);
    if (head.ok) return { ok: true, reason: `${label}, the same tree: ${head.reason}` };
    reasons.push(`${label}: ${head.reason}`);
  }
  if (made.length === 0) reasons.push("no pull request merged into main made it");
  return { ok: false, reason: reasons.join("; ") };
}

export interface WorkflowRun {
  id: number;
  /**
   * The run's name (run-name): "Plan <sha> to production" or "Release <sha>
   * to production", with " (first deploy)" when first_deploy was on.
   */
  title: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  /** The branch whose workflow file ran. */
  branch: string;
  /** Who started it (triggering_actor). */
  actor: string;
  event: string;
}

const TITLE = /^(Plan|Release) ([0-9a-fA-F]{7,40}) to production( \(first deploy\))?$/;

interface Named {
  kind: "Plan" | "Release";
  sha: string;
  firstDeploy: boolean;
}

/** A run's kind, the sha it was started with and its first_deploy, from its name. */
function named(run: WorkflowRun): Named | undefined {
  const match = TITLE.exec(run.title.trim().replace(/\s+/g, " "));
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  return {
    kind: match[1] as Named["kind"],
    sha: match[2].toLowerCase(),
    firstDeploy: match[3] !== undefined,
  };
}

/**
 * The two-run safety (CI19): a run that applies deploys only a plan the owner
 * could read. It needs a passed plan run of this same commit, newer than every
 * earlier release run that ran (passed, failed or was cancelled: each may have
 * changed production, so an older plan no longer shows what will change).
 * Runs skipped by the owner-only rule never ran and do not count. The plan
 * must be the owner's, started by hand from main's workflow file, with the
 * same first_deploy (it relaxes the guard the owner read).
 */
export function planFor(opts: {
  sha: string;
  runs: WorkflowRun[];
  currentRunId: number;
  firstDeploy: boolean;
  owner: string;
}): Verdict {
  const time = (run: WorkflowRun) => Date.parse(run.createdAt);
  const ran = (run: WorkflowRun) =>
    run.status === "completed" && run.conclusion !== null && run.conclusion !== "skipped";
  const others = opts.runs.filter((run) => run.id !== opts.currentRunId);
  const lastRelease = others
    .filter((run) => named(run)?.kind === "Release" && ran(run))
    .toSorted((a, b) => time(b) - time(a))[0];
  const plan = others
    .filter((run) => {
      const name = named(run);
      return (
        name?.kind === "Plan" &&
        opts.sha.startsWith(name.sha) &&
        name.firstDeploy === opts.firstDeploy &&
        run.branch === "main" &&
        run.actor === opts.owner &&
        run.event === "workflow_dispatch" &&
        run.status === "completed" &&
        run.conclusion === "success" &&
        (lastRelease === undefined || time(run) > time(lastRelease))
      );
    })
    .toSorted((a, b) => time(b) - time(a))[0];
  if (plan !== undefined) {
    return { ok: true, reason: `the plan run ${String(plan.id)} (${plan.createdAt})` };
  }
  const since =
    lastRelease === undefined
      ? ""
      : ` since the last release run, ${String(lastRelease.id)} (${lastRelease.createdAt})`;
  return {
    ok: false,
    reason: `no passed plan of ${opts.sha.slice(0, 10)}${opts.firstDeploy ? " with first_deploy" : ""}${since}: run the workflow with apply off first (the same first_deploy) and read its plan`,
  };
}

export interface ReleaseDeps {
  run: Run;
  /** main's checkout, with its full history. */
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  log: (line: string) => void;
  /** Appends to a file ($GITHUB_OUTPUT, $GITHUB_STEP_SUMMARY). */
  append: (file: string, text: string) => void;
}

function gh(run: Run, args: string[]): unknown {
  return JSON.parse(run("gh", args));
}

function statusesOf(run: Run, slug: string, sha: string): Status[] {
  return gh(run, [
    "api",
    `repos/${slug}/commits/${sha}/statuses?per_page=100`,
    "--jq",
    "[.[] | {context, state, description, creator: .creator.login}]",
  ]) as Status[];
}

interface ApiPull {
  number: number;
  merged_at: string | null;
  merge_commit_sha: string | null;
  base: { ref: string };
  head: { sha: string };
}

function pullsOf(run: Run, slug: string, sha: string): Pull[] {
  const pulls = gh(run, ["api", `repos/${slug}/commits/${sha}/pulls`]) as ApiPull[];
  return pulls.map((p) => {
    let headTree: string | undefined;
    try {
      headTree = run("gh", [
        "api",
        `repos/${slug}/git/commits/${p.head.sha}`,
        "--jq",
        ".tree.sha",
      ]).trim();
    } catch {
      headTree = undefined;
    }
    return {
      number: p.number,
      base: p.base.ref,
      merged: p.merged_at !== null,
      mergeCommit: p.merge_commit_sha,
      headSha: p.head.sha,
      headTree,
      headStatuses: statusesOf(run, slug, p.head.sha),
    };
  });
}

/** planFor, on this workflow's runs as GitHub lists them. */
function planOnGitHub(
  run: Run,
  slug: string,
  sha: string,
  env: ReleaseDeps["env"],
  owner: string,
): Verdict {
  const workflow = env.WORKFLOW ?? "deploy-production.yml";
  const runs = gh(run, [
    "api",
    `repos/${slug}/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=100`,
    "--jq",
    "[.workflow_runs[] | {id, title: .display_title, status, conclusion, createdAt: .created_at, branch: .head_branch, actor: .triggering_actor.login, event}]",
  ]) as WorkflowRun[];
  return planFor({
    sha,
    runs,
    currentRunId: Number(env.RUN_ID),
    firstDeploy: env.FIRST_DEPLOY === "true",
    owner,
  });
}

/** The Node major a commit pins, from its .nvmrc. */
function pinnedAt(git: (...args: string[]) => string, sha: string): number | undefined {
  try {
    return majorOf(git("show", `${sha}:.nvmrc`));
  } catch {
    return undefined;
  }
}

/**
 * The workflow's release check. Env: SHA_INPUT (the owner's input), APPLY
 * ("true" or "false"), FIRST_DEPLOY ("true" or "false"), REPO (owner/name),
 * OWNER (the one account whose proofs and plans count), RUN_ID, RUN_ATTEMPT,
 * WORKFLOW (its file name), MAIN (default origin/main), GITHUB_OUTPUT and
 * GITHUB_STEP_SUMMARY. Writes
 * the full sha as the step's `sha` output. 0 passes, 1 refuses.
 */
export function releaseCheck(deps: ReleaseDeps): number {
  const { env, run, cwd } = deps;
  const refuse = (reason: string): number => {
    deps.log(`::error::Not released: ${reason}.`);
    if (env.GITHUB_STEP_SUMMARY) {
      deps.append(env.GITHUB_STEP_SUMMARY, `### Not released\n\n${reason}.\n`);
    }
    return 1;
  };
  const slug = env.REPO;
  if (!slug) return refuse("REPO is not set");
  const owner = env.OWNER;
  if (!owner) return refuse("OWNER is not set");
  const apply = env.APPLY === "true";
  // A re-run keeps the run's id, so its earlier attempt would not count as a
  // release that ran; a release that failed midway is planned again instead.
  if (apply && Number(env.RUN_ATTEMPT ?? "1") > 1) {
    return refuse("a release is never re-run: plan the commit again, read it, then release");
  }
  const input = releaseInput(env.SHA_INPUT);
  if (!input.ok) return refuse(input.reason);

  const git = (...args: string[]) => run("git", args, { cwd }).trim();
  let sha: string;
  try {
    sha = git("rev-parse", "--verify", "--quiet", `${input.sha}^{commit}`);
  } catch {
    return refuse(
      `${input.sha} is not one commit of this repository (unknown, or too short to name one)`,
    );
  }
  const main = env.MAIN ?? "origin/main";
  try {
    git("merge-base", "--is-ancestor", sha, main);
  } catch {
    return refuse(`${sha} is not on main's history (${main})`);
  }

  const node = pinnedAt(git, sha);
  const proof = releaseProof({
    sha,
    tree: git("rev-parse", `${sha}^{tree}`),
    statuses: statusesOf(run, slug, sha),
    pulls: pullsOf(run, slug, sha),
    node,
    poster: owner,
  });
  if (!proof.ok) {
    return refuse(
      `${sha} has no passed pnpm check:full (CI17): ${proof.reason}. Check it out in a clean worktree and run pnpm check:full there; it posts the proof on the commit`,
    );
  }

  let plan = "plan only: nothing is deployed";
  if (apply) {
    const verdict = planOnGitHub(run, slug, sha, env, owner);
    if (!verdict.ok) return refuse(verdict.reason);
    plan = `applies ${verdict.reason}`;
  }

  const subject = git("log", "-1", "--format=%s", sha);
  deps.log(`Release check passed for ${sha} (${subject}): ${proof.reason}; ${plan}.`);
  if (env.GITHUB_OUTPUT) deps.append(env.GITHUB_OUTPUT, `sha=${sha}\n`);
  if (env.GITHUB_STEP_SUMMARY) {
    deps.append(
      env.GITHUB_STEP_SUMMARY,
      [
        `### ${apply ? "Release" : "Plan"} of \`${sha}\` to production`,
        "",
        subject,
        "",
        `- On main's history (${main})`,
        `- Proof: ${proof.reason}`,
        `- ${plan[0]?.toUpperCase() ?? ""}${plan.slice(1)}`,
        "",
      ].join("\n"),
    );
  }
  return 0;
}
