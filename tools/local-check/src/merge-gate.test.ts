// pnpm merge-gate <pr> (CI decisions CI18): run with fake git, gh and pnpm.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Run, Stream } from "./exec.ts";

import {
  bothAffect,
  type GateDeps,
  judgeChecks,
  mergeGate,
  mergeSuites,
  packagesReading,
  rootReaders,
} from "./merge-gate.ts";
import { SWEEP_LINT, TRUTH_TEST } from "./plan.ts";

const HEAD = "a".repeat(40);
const MAIN = "e".repeat(40);
const BASE = "b".repeat(40);
const TREE = "d".repeat(40);
const MERGE = "c".repeat(40);
// The main checkout's git data; the heavy lock is taken under it for real.
const CHECKOUT = mkdtempSync(path.join(tmpdir(), "merge-gate-"));
const COMMON = path.join(CHECKOUT, ".git");
const DIR = path.join(CHECKOUT, ".claude", "worktrees", "merge-gate-pr42");

// The repo's own turbo.json: which tasks read files outside their package.
const TURBO_JSON = readFileSync(path.join(import.meta.dirname, "../../../turbo.json"), "utf8");

const PROOF = { __typename: "StatusContext", context: "local/check-full", state: "SUCCESS" };
const JOB = { __typename: "CheckRun", name: "proof", status: "COMPLETED", conclusion: "SUCCESS" };

interface World {
  pr?: Record<string, unknown>;
  /** What FETCH_HEAD holds after fetching the PR's head. */
  fetched?: string;
  /** Whether origin/main is an ancestor of the head. */
  containsMain?: boolean;
  conflict?: boolean;
  prSide?: string[];
  mainSide?: string[];
  /** The files each side changed since the merge base (git diff). */
  prFiles?: string[];
  mainFiles?: string[];
  /** A streamed command whose args contain this fails. */
  failing?: string;
  node?: string;
}

function world(w: World = {}) {
  const calls: string[] = [];
  const streamed: { line: string; cwd: string }[] = [];
  const logs: string[] = [];
  const removed: string[] = [];
  const exits: (() => void)[] = [];
  const turboLs: { head?: string; base?: string; cwd?: string }[] = [];
  const pr = {
    number: 42,
    state: "OPEN",
    isDraft: false,
    baseRefName: "main",
    headRefName: "stage1/x",
    headRefOid: HEAD,
    mergeable: "MERGEABLE",
    statusCheckRollup: [PROOF, JOB],
    ...w.pr,
  };
  const run: Run = (cmd, args, opts) => {
    const line = [cmd, ...args].join(" ");
    calls.push(line);
    const answers: [RegExp, () => string][] = [
      [/^gh pr view 42 --json /, () => JSON.stringify(pr)],
      [/^git fetch /, () => ""],
      [/^git rev-parse FETCH_HEAD$/, () => `${w.fetched ?? HEAD}\n`],
      [/^git rev-parse refs\/remotes\/origin\/main$/, () => `${MAIN}\n`],
      [/^git rev-parse --git-common-dir$/, () => `${COMMON}\n`],
      [
        /^git merge-base --is-ancestor /,
        () => {
          if (w.containsMain !== true) throw new Error("git merge-base failed");
          return "";
        },
      ],
      [/^git merge-base /, () => `${BASE}\n`],
      [/^git rev-list --count /, () => "3\n"],
      [
        /^git merge-tree --write-tree /,
        () => {
          if (w.conflict === true) throw new Error("git merge-tree failed: CONFLICT (content)");
          return `${TREE}\n`;
        },
      ],
      [/^git commit-tree /, () => `${MERGE}\n`],
      [new RegExp(`^git show ${MERGE}:turbo.json$`), () => TURBO_JSON],
      [
        /^git diff --name-only /,
        () => `${((line.endsWith(HEAD) ? w.prFiles : w.mainFiles) ?? []).join("\n")}\n`,
      ],
      [/^git worktree /, () => ""],
      [
        /^pnpm exec turbo ls --affected --output=json$/,
        () => {
          turboLs.push({
            head: opts?.env?.TURBO_SCM_HEAD,
            base: opts?.env?.TURBO_SCM_BASE,
            cwd: opts?.cwd,
          });
          const side = opts?.env?.TURBO_SCM_HEAD === HEAD ? w.prSide : w.mainSide;
          const items = (side ?? ["@acme/frontend"]).map((name) => ({ name }));
          return JSON.stringify({ packages: { items } });
        },
      ],
    ];
    const answer = answers.find(([re]) => re.test(line));
    if (answer === undefined) throw new Error(`unexpected command: ${line}`);
    return answer[1]();
  };
  const stream: Stream = (cmd, args, opts) => {
    const line = [cmd, ...args].join(" ");
    streamed.push({ line, cwd: opts.cwd });
    return Promise.resolve(w.failing !== undefined && line.includes(w.failing) ? 1 : 0);
  };
  const deps: GateDeps = {
    run,
    stream,
    root: path.join(CHECKOUT, ".claude", "worktrees", "orchestrator"),
    node: { version: w.node ?? "v24.21.0", pinned: "24.21.0\n" },
    log: (line) => logs.push(line),
    removeDir: (dir) => removed.push(dir),
    atExit: (fn) => exits.push(fn),
    lock: { pollMs: 5 },
  };
  const output = () => logs.join("\n");
  const neverActs = () => {
    for (const call of [...calls, ...streamed.map((s) => s.line)]) {
      expect(call).not.toMatch(/gh pr merge|git push|--method POST|gh pr ready/);
    }
  };
  return { deps, calls, streamed, logs, removed, exits, turboLs, output, neverActs };
}

const MERGE_LINE = `gh pr merge 42 --squash --match-head-commit ${HEAD}`;

describe("judgeChecks", () => {
  it("CI18: passes when the proof and the proof job passed, and every other check passed or was skipped", () => {
    const result = judgeChecks([
      PROOF,
      JOB,
      { __typename: "CheckRun", name: "other", status: "COMPLETED", conclusion: "SKIPPED" },
    ]);
    expect(result).toEqual({ ok: true, passed: ["local/check-full", "proof", "other"] });
  });

  it("CI18: refuses without the local/check-full proof", () => {
    const result = judgeChecks([JOB]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/local\/check-full/);
  });

  it("CI18: refuses a proof job that was only skipped (it was skipped on a draft, CI17)", () => {
    const result = judgeChecks([PROOF, { ...JOB, conclusion: "SKIPPED" }]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/proof/);
  });

  it("CI18: refuses a check still running, or one that failed, naming it", () => {
    const running = judgeChecks([PROOF, { ...JOB, status: "IN_PROGRESS", conclusion: "" }]);
    expect(!running.ok && running.reason).toMatch(/proof.*still running/);
    const failed = judgeChecks([
      PROOF,
      JOB,
      { __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "FAILURE" },
    ]);
    expect(!failed.ok && failed.reason).toMatch(/lint.*FAILURE/);
    const pending = judgeChecks([{ ...PROOF, state: "PENDING" }, JOB]);
    expect(!pending.ok && pending.reason).toMatch(/local\/check-full.*PENDING/);
  });
});

describe("judgeChecks, the newest run of each check", () => {
  it("CI18: reads the newest run of a check, as the branch rule does", () => {
    const old = { ...JOB, conclusion: "FAILURE", startedAt: "2026-10-19T00:00:00Z" };
    const rerun = { ...JOB, startedAt: "2026-10-19T00:05:00Z" };
    expect(judgeChecks([PROOF, old, rerun]).ok).toBe(true);
    expect(judgeChecks([PROOF, rerun, { ...old, startedAt: "2026-10-19T00:09:00Z" }]).ok).toBe(
      false,
    );
  });
});

describe("rootReaders", () => {
  it("CI18: finds the packages whose tasks read files outside their folder, from turbo.json", () => {
    const readers = rootReaders(TURBO_JSON);
    const reading = (file: string) =>
      packagesReading([file], readers).sort((x, y) => x.localeCompare(y));
    expect(reading("docs/product/signup.md")).toEqual([
      "@acme/backend",
      "@acme/bootstrap",
      "@acme/competitors",
      "@acme/sweep",
    ]);
    expect(reading("docs/runbooks/deployment.md")).toEqual([
      "@acme/backend",
      "@acme/bootstrap",
      "@acme/sweep",
    ]);
    expect(reading("CLAUDE.md")).toEqual(["@acme/bootstrap", "@acme/sweep"]);
    expect(reading("infra/aws/README.md")).toEqual(["@acme/bootstrap", "@acme/sweep"]);
    expect(reading("frontend/node_modules/x/README.md")).toEqual([]);
    expect(reading(".superpowers/notes.md")).toEqual([]);
    expect(reading("package.json")).toEqual(["//"]);
    expect(reading(".github/workflows/ci.yml")).toEqual(["@acme/bootstrap", "//"]);
    expect(reading("frontend/src/app/page.tsx")).toEqual([]);
  });
});

describe("bothAffect", () => {
  it("CI18: is the packages each side affects, sorted", () => {
    expect(
      bothAffect(
        ["@acme/frontend", "@acme/deploy"],
        ["@acme/contracts", "@acme/frontend", "@acme/backend", "@acme/deploy"],
      ),
    ).toEqual(["@acme/deploy", "@acme/frontend"]);
    expect(bothAffect(["@acme/backend"], ["@acme/design"])).toEqual([]);
  });
});

describe("mergeSuites", () => {
  it("CI18: runs format, lint, types, knip and the unit tests of the packages both sides affect, then the repo-wide checks", () => {
    const suites = mergeSuites(["@acme/deploy", "@acme/frontend"]);
    expect(suites.map((s) => s.name)).toEqual([
      "format, lint, types, knip",
      "unit and browser tests",
      SWEEP_LINT.name,
      TRUTH_TEST.name,
    ]);
    const filters = ["--filter=@acme/deploy", "--filter=@acme/frontend"];
    expect(suites[0]?.args).toEqual([
      "exec",
      "turbo",
      "run",
      "format",
      "lint",
      "typecheck",
      "knip",
      ...filters,
    ]);
    expect(suites[1]?.args).toEqual([
      "exec",
      "turbo",
      "run",
      "test",
      ...filters,
      "--concurrency=1",
    ]);
    expect(suites[1]?.heavy).toBe(true);
    // Nothing after `--`: turbo would hash it and stop replaying its cache.
    for (const suite of suites) expect(suite.args).not.toContain("--");
  });

  it("CI18: formats the root when both sides change its files, and runs no root test", () => {
    const suites = mergeSuites(["//"]);
    expect(suites.map((s) => s.name)).toEqual([
      "format, lint, types, knip",
      SWEEP_LINT.name,
      TRUTH_TEST.name,
    ]);
    expect(suites[0]?.args).toContain("--filter=//");
    const both = mergeSuites(["//", "@acme/frontend"]);
    expect(both[1]?.args).toEqual([
      "exec",
      "turbo",
      "run",
      "test",
      "--filter=@acme/frontend",
      "--concurrency=1",
    ]);
  });

  it("CI18: runs only the repo-wide checks when no package is affected by both sides", () => {
    expect(mergeSuites([])).toEqual([SWEEP_LINT, TRUTH_TEST]);
  });
});

describe("mergeGate", () => {
  it("CI18: refuses on another Node major, before asking GitHub", async () => {
    const w = world({ node: "v26.1.0" });
    expect(await mergeGate(w.deps, 42)).toBe(1);
    expect(w.calls).toEqual([]);
    expect(w.output()).toMatch(/Node/);
  });

  it("CI18: refuses a draft, a closed PR, and a PR into another branch", async () => {
    for (const pr of [{ isDraft: true }, { state: "MERGED" }, { baseRefName: "release" }]) {
      const w = world({ pr });
      expect(await mergeGate(w.deps, 42)).toBe(1);
      expect(w.output()).toMatch(/BLOCKED/);
      expect(w.output()).not.toContain(MERGE_LINE);
      expect(w.calls.some((c) => c.startsWith("git fetch"))).toBe(false);
    }
  });

  it("CI18: refuses when a check has not passed, or GitHub says the PR conflicts", async () => {
    const failing = world({ pr: { statusCheckRollup: [JOB] } });
    expect(await mergeGate(failing.deps, 42)).toBe(1);
    expect(failing.output()).toMatch(/BLOCKED.*local\/check-full/s);
    const conflicting = world({ pr: { mergeable: "CONFLICTING" } });
    expect(await mergeGate(conflicting.deps, 42)).toBe(1);
    expect(conflicting.output()).toMatch(/conflicts with main/);
  });

  it("CI18: refuses when the head moved after GitHub reported it", async () => {
    const w = world({ fetched: "f".repeat(40) });
    expect(await mergeGate(w.deps, 42)).toBe(1);
    expect(w.output()).toMatch(/head moved/);
    expect(w.streamed).toEqual([]);
  });

  it("CI18: passes at once when the head contains origin/main: the squash's tree is the proven tree", async () => {
    const w = world({ containsMain: true });
    expect(await mergeGate(w.deps, 42)).toBe(0);
    expect(w.calls).toContain(`git merge-base --is-ancestor ${MAIN} ${HEAD}`);
    expect(w.calls.some((c) => c.startsWith("git worktree add"))).toBe(false);
    expect(w.streamed).toEqual([]);
    expect(w.output()).toMatch(/PASS/);
    expect(w.output()).toContain(MERGE_LINE);
    w.neverActs();
  });

  it("CI18: when main moved, checks the merge result in a throwaway worktree, then removes it", async () => {
    const w = world({
      prSide: ["@acme/frontend", "@acme/deploy"],
      mainSide: ["@acme/contracts", "@acme/frontend", "@acme/deploy"],
    });
    expect(await mergeGate(w.deps, 42)).toBe(0);
    // The tree GitHub's squash would make, as a local commit nobody pushes.
    expect(w.calls).toContain(`git merge-tree --write-tree ${MAIN} ${HEAD}`);
    expect(w.calls).toContain(
      `git commit-tree ${TREE} -p ${MAIN} -p ${HEAD} -m merge-gate: #42 onto main`,
    );
    const add = w.calls.indexOf(`git worktree add --detach ${DIR} ${MERGE}`);
    expect(add).toBeGreaterThan(-1);
    // A stale worktree of an interrupted run is removed first.
    expect(w.calls.slice(0, add)).toContain(`git worktree remove --force ${DIR}`);
    expect(w.streamed[0]).toEqual({
      line: "pnpm install --frozen-lockfile --prefer-offline",
      cwd: DIR,
    });
    expect(w.streamed.slice(1).map((s) => s.line)).toEqual(
      mergeSuites(["@acme/deploy", "@acme/frontend"]).map((s) => [s.cmd, ...s.args].join(" ")),
    );
    for (const s of w.streamed) expect(s.cwd).toBe(DIR);
    // Each side measured from the merge base, in the merge result.
    expect(w.turboLs).toEqual([
      { head: HEAD, base: BASE, cwd: DIR },
      { head: MAIN, base: BASE, cwd: DIR },
    ]);
    expect(w.calls.at(-2)).toBe(`git worktree remove --force ${DIR}`);
    expect(w.calls.at(-1)).toBe("git worktree prune");
    expect(w.removed).toContain(DIR);
    expect(w.output()).toMatch(/main moved 3 commits/);
    expect(w.output()).toMatch(/both sides affect: @acme\/deploy, @acme\/frontend/);
    expect(w.output()).toMatch(/PASS/);
    expect(w.output()).toContain(MERGE_LINE);
    expect(w.output()).toContain(MAIN.slice(0, 10));
    w.neverActs();
  });

  it("CI18: a side's docs count for the packages whose tests read them (turbo places them in none)", async () => {
    const w = world({
      prSide: [],
      prFiles: ["docs/product/signup.md"],
      mainSide: ["@acme/competitors"],
      mainFiles: ["tools/competitors/src/check.ts"],
    });
    expect(await mergeGate(w.deps, 42)).toBe(0);
    expect(w.output()).toMatch(/both sides affect: @acme\/competitors$/m);
    expect(w.calls).toContain(`git diff --name-only ${BASE} ${HEAD}`);
    expect(w.calls).toContain(`git diff --name-only ${BASE} ${MAIN}`);
  });

  it("CI18: a check failing on the merge result blocks the merge, and the worktree still goes", async () => {
    const w = world({ failing: "typecheck" });
    expect(await mergeGate(w.deps, 42)).toBe(1);
    expect(w.output()).toMatch(/BLOCKED.*format, lint, types, knip/s);
    expect(w.output()).toMatch(/merge origin\/main into the branch/);
    expect(w.output()).not.toContain(MERGE_LINE);
    expect(w.calls.at(-2)).toBe(`git worktree remove --force ${DIR}`);
    w.neverActs();
  });

  it("CI18: a failed install blocks too, and the worktree still goes", async () => {
    const w = world({ failing: "install" });
    expect(await mergeGate(w.deps, 42)).toBe(1);
    expect(w.streamed).toHaveLength(1);
    expect(w.calls.at(-2)).toBe(`git worktree remove --force ${DIR}`);
  });

  it("CI18: a conflicting merge blocks without building anything", async () => {
    const w = world({ conflict: true });
    expect(await mergeGate(w.deps, 42)).toBe(1);
    expect(w.output()).toMatch(/BLOCKED.*conflict/s);
    expect(w.calls.some((c) => c.startsWith("git worktree add"))).toBe(false);
  });

  it("CI18: removes the worktree if the process exits mid-run (a tool's timeout)", async () => {
    const w = world();
    let exitedAt = -1;
    // The install is killed: the process exits, running what it registered.
    w.deps.stream = () => {
      if (exitedAt === -1) {
        exitedAt = w.calls.length;
        for (const fn of w.exits) fn();
      }
      return Promise.resolve(0);
    };
    await mergeGate(w.deps, 42);
    expect(w.exits).toHaveLength(1);
    expect(w.calls.slice(exitedAt)).toContain(`git worktree remove --force ${DIR}`);
  });
});
