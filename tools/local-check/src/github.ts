// The proof GitHub reads (CI decisions CI9, CI17): a commit status named
// `local/check-full` on the commit that passed, which main's branch rule
// requires. ci.yml's one job, `proof`, looks for it on a ready PR's head (step
// "Local check proof", .github/scripts/local-proof.sh) and checks that it
// covers the change; posting it re-runs that job when it failed.
import type { Run } from "./exec.ts";

export const PROOF_CONTEXT = "local/check-full";
export const PROOF_JOB = "proof";
export const PROOF_STEP = "Local check proof";

export type PrState =
  | { kind: "none" }
  | { kind: "pr"; number: number; draft: boolean; open: boolean }
  | { kind: "unknown"; reason: string };

/** owner/name of the origin remote, from its URL (https or ssh). */
export function repoSlug(run: Run, cwd: string): string {
  const url = run("git", ["remote", "get-url", "origin"], { cwd }).trim();
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url);
  if (match?.[1] === undefined) throw new Error(`origin is not a GitHub repository: ${url}`);
  return match[1];
}

/**
 * repoSlug, or undefined when there is no origin or it is not on GitHub: a new
 * project has none until bootstrap step 3 makes its repository.
 */
export function githubSlug(run: Run, cwd: string): string | undefined {
  try {
    return repoSlug(run, cwd);
  } catch {
    return undefined;
  }
}

export function prState(run: Run, cwd: string, branch: string): PrState {
  let out: string;
  try {
    out = run("gh", ["pr", "view", branch, "--json", "number,isDraft,state"], { cwd });
  } catch (error) {
    const message = (error as Error).message;
    if (/no pull requests found/i.test(message)) return { kind: "none" };
    return { kind: "unknown", reason: message.split("\n")[0] ?? message };
  }
  const pr = JSON.parse(out) as { number: number; isDraft: boolean; state: string };
  return { kind: "pr", number: pr.number, draft: pr.isDraft, open: pr.state === "OPEN" };
}

export function onGitHub(run: Run, slug: string, sha: string): boolean {
  try {
    run("gh", ["api", `repos/${slug}/commits/${sha}`, "--jq", ".sha"]);
    return true;
  } catch {
    return false;
  }
}

export function postProof(run: Run, slug: string, sha: string, description: string): void {
  run("gh", [
    "api",
    "--method",
    "POST",
    `repos/${slug}/statuses/${sha}`,
    "-f",
    "state=success",
    "-f",
    `context=${PROOF_CONTEXT}`,
    "-f",
    `description=${description}`,
  ]);
}

interface Job {
  name: string;
  conclusion: string | null;
}

/**
 * Re-runs each of the commit's runs whose `proof` job failed: it failed for
 * the want of the proof, or of one that covers the change, which was just
 * posted. Never throws: the proof is already posted, and a run that cannot be
 * re-run (already re-running, a GitHub error) is reported, not fatal.
 */
export function rerunWaitingRuns(
  run: Run,
  slug: string,
  sha: string,
): { rerun: number[]; failed: number[] } {
  const rerun: number[] = [];
  const failed: number[] = [];
  let runs: number[];
  try {
    runs = JSON.parse(
      run("gh", [
        "api",
        `repos/${slug}/actions/runs?head_sha=${sha}&per_page=20`,
        "--jq",
        '[.workflow_runs[] | select(.conclusion == "failure") | .id]',
      ]),
    ) as number[];
  } catch {
    return { rerun, failed };
  }
  for (const id of runs) {
    try {
      const jobs = JSON.parse(
        run("gh", [
          "api",
          `repos/${slug}/actions/runs/${String(id)}/jobs`,
          "--jq",
          `[.jobs[] | select(.name == "${PROOF_JOB}") | {name, conclusion}]`,
        ]),
      ) as Job[];
      if (!jobs.some((j) => j.name === PROOF_JOB && j.conclusion === "failure")) continue;
      run("gh", ["run", "rerun", String(id), "--failed", "--repo", slug]);
      rerun.push(id);
    } catch {
      failed.push(id);
    }
  }
  return { rerun, failed };
}
