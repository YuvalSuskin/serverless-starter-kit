// deploy-production.yml's release check (CI decisions CI19), with fake git and gh.
import { describe, expect, it } from "vitest";

import type { Run } from "./exec.ts";

import {
  planFor,
  type Pull,
  releaseCheck,
  releaseInput,
  releaseProof,
  type Status,
  type WorkflowRun,
} from "./release.ts";

const SHA = "a".repeat(40);
const TREE = "d".repeat(40);
const HEAD = "b".repeat(40);
const PASSED: Status = {
  context: "local/check-full",
  state: "success",
  description: "[e2e none node24] passed in 1m2s: abc",
  creator: "owner",
};

function pull(over: Partial<Pull> = {}): Pull {
  return {
    number: 207,
    base: "main",
    merged: true,
    mergeCommit: SHA,
    headSha: HEAD,
    headTree: TREE,
    headStatuses: [PASSED],
    ...over,
  };
}

describe("CI19: the input names a commit", () => {
  it("takes a full or short sha, trimmed, in any case", () => {
    expect(releaseInput(` ${SHA.toUpperCase()} `)).toEqual({ ok: true, sha: SHA });
    expect(releaseInput("f03936a")).toEqual({ ok: true, sha: "f03936a" });
  });

  it("refuses anything else before git sees it", () => {
    for (const raw of [undefined, "", "abc123", "main", "HEAD~1", `${SHA}0`, "a;rm -rf /"]) {
      expect(releaseInput(raw).ok).toBe(false);
    }
  });
});

describe("CI19: the release carries the local proof (CI17)", () => {
  it("its own passed proof, on the Node the commit pins", () => {
    const verdict = releaseProof({
      poster: "owner",
      sha: SHA,
      tree: TREE,
      statuses: [PASSED],
      pulls: [],
      node: 24,
    });
    expect(verdict.ok).toBe(true);
  });

  it("a squash commit: the proof of the pull request's head with the same tree", () => {
    const verdict = releaseProof({
      poster: "owner",
      sha: SHA,
      tree: TREE,
      statuses: [],
      pulls: [pull()],
      node: 24,
    });
    expect(verdict).toEqual({
      ok: true,
      reason: `#207's head ${HEAD.slice(0, 10)}, the same tree: ${PASSED.description ?? ""}`,
    });
  });

  it("refuses a head whose tree is not the commit's (main moved before the merge)", () => {
    const verdict = releaseProof({
      poster: "owner",
      sha: SHA,
      tree: TREE,
      statuses: [],
      pulls: [pull({ headTree: "e".repeat(40) })],
      node: 24,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("another tree");
  });

  it("refuses a pull request that did not make this commit on main", () => {
    for (const other of [
      pull({ merged: false }),
      pull({ base: "release" }),
      pull({ mergeCommit: "c".repeat(40) }),
    ]) {
      const verdict = releaseProof({
        poster: "owner",
        sha: SHA,
        tree: TREE,
        statuses: [],
        pulls: [other],
        node: 24,
      });
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toContain("no pull request merged into main made it");
    }
  });

  it("refuses a failed, pending or missing proof, the newest status deciding", () => {
    const failed: Status = { ...PASSED, state: "failure" };
    for (const statuses of [[], [failed, PASSED], [{ ...PASSED, state: "pending" }]]) {
      const verdict = releaseProof({
        poster: "owner",
        sha: SHA,
        tree: TREE,
        statuses,
        pulls: [],
        node: 24,
      });
      expect(verdict.ok).toBe(false);
    }
  });

  it("refuses a proof posted by another account than the owner's", () => {
    for (const creator of ["github-actions[bot]", null]) {
      const verdict = releaseProof({
        poster: "owner",
        sha: SHA,
        tree: TREE,
        statuses: [{ ...PASSED, creator }],
        pulls: [pull({ headStatuses: [{ ...PASSED, creator }] })],
        node: 24,
      });
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toContain("not owner");
    }
  });

  it("refuses a proof made on another Node, or naming none (CI16)", () => {
    const node26 = { ...PASSED, description: "[e2e none node26] passed" };
    const noNode = { ...PASSED, description: "[e2e none] passed" };
    for (const status of [node26, noNode]) {
      const verdict = releaseProof({
        poster: "owner",
        sha: SHA,
        tree: TREE,
        statuses: [status],
        pulls: [],
        node: 24,
      });
      expect(verdict.ok).toBe(false);
    }
    const unpinned = releaseProof({
      poster: "owner",
      sha: SHA,
      tree: TREE,
      statuses: [PASSED],
      pulls: [],
      node: undefined,
    });
    expect(unpinned.ok).toBe(false);
  });
});

const PLAN_OPTS = { sha: SHA, firstDeploy: false, owner: "owner" };

function runOf(
  id: number,
  title: string,
  createdAt: string,
  conclusion: string | null = "success",
): WorkflowRun {
  return {
    id,
    title,
    status: conclusion === null ? "in_progress" : "completed",
    conclusion,
    createdAt,
    branch: "main",
    actor: "owner",
    event: "workflow_dispatch",
  };
}

describe("CI19: a release applies only a plan of the same commit, with no release since", () => {
  const short = SHA.slice(0, 7);

  it("passes after a passed plan of the same commit, short or full", () => {
    for (const given of [short, SHA]) {
      const runs = [runOf(1, `Plan ${given} to production`, "2026-10-20T10:00:00Z")];
      expect(planFor({ ...PLAN_OPTS, runs, currentRunId: 2 }).ok).toBe(true);
    }
  });

  it("refuses without a plan, after a failed plan, or a plan of another commit", () => {
    const cases = [
      [],
      [runOf(1, `Plan ${short} to production`, "2026-10-20T10:00:00Z", "failure")],
      [runOf(1, `Plan ${"c".repeat(7)} to production`, "2026-10-20T10:00:00Z")],
      [runOf(1, `Plan ${short} to production`, "2026-10-20T10:00:00Z", null)],
    ];
    for (const runs of cases)
      expect(planFor({ ...PLAN_OPTS, runs, currentRunId: 9 }).ok).toBe(false);
  });

  it("refuses a plan older than a release that ran, passed, failed or cancelled", () => {
    for (const conclusion of ["success", "failure", "cancelled"]) {
      const runs = [
        runOf(1, `Plan ${short} to production`, "2026-10-20T10:00:00Z"),
        runOf(2, `Release ${"c".repeat(40)} to production`, "2026-10-20T11:00:00Z", conclusion),
      ];
      const verdict = planFor({ ...PLAN_OPTS, runs, currentRunId: 3 });
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toContain("since the last release run, 2");
    }
  });

  it("does not count a skipped release (someone else's), or the run itself", () => {
    const runs = [
      runOf(1, `Plan ${short} to production`, "2026-10-20T10:00:00Z"),
      runOf(2, `Release ${short} to production`, "2026-10-20T11:00:00Z", "skipped"),
      runOf(3, `Release ${short} to production`, "2026-10-20T12:00:00Z", null),
    ];
    expect(planFor({ ...PLAN_OPTS, runs, currentRunId: 3 }).ok).toBe(true);
  });

  it("counts only the owner's plan, started by hand from main's workflow file", () => {
    const plan = runOf(1, `Plan ${short} to production`, "2026-10-20T10:00:00Z");
    for (const other of [{ branch: "x" }, { actor: "someone" }, { event: "push" }]) {
      const runs = [{ ...plan, ...other }];
      expect(planFor({ ...PLAN_OPTS, runs, currentRunId: 9 }).ok).toBe(false);
    }
  });

  it("a release with first_deploy needs a plan with it, and one without, a plan without", () => {
    const plain = runOf(1, `Plan ${short} to production`, "2026-10-20T10:00:00Z");
    const first = runOf(2, `Plan ${short} to production (first deploy)`, "2026-10-20T10:00:00Z");
    expect(planFor({ ...PLAN_OPTS, firstDeploy: true, runs: [plain], currentRunId: 9 }).ok).toBe(
      false,
    );
    expect(planFor({ ...PLAN_OPTS, firstDeploy: true, runs: [first], currentRunId: 9 }).ok).toBe(
      true,
    );
    expect(planFor({ ...PLAN_OPTS, runs: [first], currentRunId: 9 }).ok).toBe(false);
  });

  it("a release with first_deploy counts as a release that ran", () => {
    const runs = [
      runOf(1, `Plan ${short} to production`, "2026-10-20T10:00:00Z"),
      runOf(2, `Release ${short} to production (first deploy)`, "2026-10-20T11:00:00Z", "failure"),
    ];
    expect(planFor({ ...PLAN_OPTS, runs, currentRunId: 3 }).ok).toBe(false);
  });

  it("a plan made after the last release counts", () => {
    const runs = [
      runOf(1, `Release ${short} to production`, "2026-10-20T10:00:00Z"),
      runOf(2, `Plan ${short} to production`, "2026-10-20T11:00:00Z"),
    ];
    expect(planFor({ ...PLAN_OPTS, runs, currentRunId: 3 }).ok).toBe(true);
  });
});

interface World {
  ancestor?: boolean;
  known?: boolean;
  statuses?: Status[];
  pulls?: unknown[];
  runs?: WorkflowRun[];
}

function world(w: World = {}) {
  const files: Record<string, string> = {};
  const logs: string[] = [];
  const fail = (message: string) => {
    throw new Error(message);
  };
  // git's answers, by subcommand; `rev-parse --verify` resolves the input.
  const git: Record<string, (args: string[]) => string> = {
    "rev-parse": (args) => {
      if (args[1] !== "--verify") return `${TREE}\n`;
      return w.known === false ? fail("unknown") : `${SHA}\n`;
    },
    "merge-base": () => (w.ancestor === false ? fail("not an ancestor") : ""),
    show: () => "24\n",
    log: () => "A change (#207)\n",
  };
  // gh's answers, by a piece of the API path.
  const api: [string, () => string][] = [
    [`/commits/${SHA}/statuses`, () => JSON.stringify(w.statuses ?? [])],
    [`/commits/${HEAD}/statuses`, () => JSON.stringify([PASSED])],
    [`/commits/${SHA}/pulls`, () => JSON.stringify(w.pulls ?? [])],
    [`/git/commits/${HEAD}`, () => `${TREE}\n`],
    ["/actions/workflows/deploy-production.yml/runs", () => JSON.stringify(w.runs ?? [])],
  ];
  const run: Run = (cmd, args) => {
    const line = `${cmd} ${args.join(" ")}`;
    const answer =
      cmd === "git" ? git[args[0] ?? ""] : api.find(([path]) => line.includes(path))?.[1];
    return answer === undefined ? fail(`unexpected: ${line}`) : answer(args);
  };
  const deps = (env: Record<string, string>) => ({
    run,
    cwd: "/repo",
    env: {
      REPO: "o/r",
      OWNER: "owner",
      GITHUB_OUTPUT: "out",
      GITHUB_STEP_SUMMARY: "summary",
      RUN_ID: "9",
      ...env,
    },
    log: (l: string) => logs.push(l),
    append: (file: string, text: string) => {
      files[file] = (files[file] ?? "") + text;
    },
  });
  return { deps, files, logs };
}

const API_PULL = {
  number: 207,
  merged_at: "2026-10-20T09:00:00Z",
  merge_commit_sha: SHA,
  base: { ref: "main" },
  head: { sha: HEAD },
};

describe("CI19: the workflow's step", () => {
  it("a plan of a squash commit on main: the full sha as the step's output", () => {
    const { deps, files } = world({ pulls: [API_PULL] });
    expect(releaseCheck(deps({ SHA_INPUT: SHA.slice(0, 7), APPLY: "false" }))).toBe(0);
    expect(files.out).toBe(`sha=${SHA}\n`);
    expect(files.summary).toContain(`### Plan of \`${SHA}\` to production`);
    expect(files.summary).toContain("Plan only: nothing is deployed");
  });

  it("refuses a commit that is not on main's history, and writes no sha", () => {
    const { deps, files, logs } = world({ ancestor: false, statuses: [PASSED] });
    expect(releaseCheck(deps({ SHA_INPUT: SHA, APPLY: "false" }))).toBe(1);
    expect(files.out).toBeUndefined();
    expect(logs.join("\n")).toContain("is not on main's history");
  });

  it("refuses an unknown commit, and one with no proof", () => {
    expect(releaseCheck(world({ known: false }).deps({ SHA_INPUT: SHA, APPLY: "false" }))).toBe(1);
    const unproven = world();
    expect(releaseCheck(unproven.deps({ SHA_INPUT: SHA, APPLY: "false" }))).toBe(1);
    expect(unproven.files.summary).toContain("has no passed pnpm check:full");
  });

  it("never applies on a re-run, whose earlier attempt keeps the run's id", () => {
    const planned = world({
      statuses: [PASSED],
      runs: [runOf(5, `Plan ${SHA} to production`, "2026-10-20T10:00:00Z")],
    });
    const verdict = releaseCheck(planned.deps({ SHA_INPUT: SHA, APPLY: "true", RUN_ATTEMPT: "2" }));
    expect(verdict).toBe(1);
    expect(planned.logs.join("\n")).toContain("a release is never re-run");
  });

  it("an apply needs the plan; with it, it passes", () => {
    const without = world({ statuses: [PASSED] });
    expect(releaseCheck(without.deps({ SHA_INPUT: SHA, APPLY: "true" }))).toBe(1);
    const planned = world({
      statuses: [PASSED],
      runs: [runOf(5, `Plan ${SHA} to production`, "2026-10-20T10:00:00Z")],
    });
    expect(releaseCheck(planned.deps({ SHA_INPUT: SHA, APPLY: "true" }))).toBe(0);
    expect(planned.files.summary).toContain("Applies the plan run 5");
  });
});
