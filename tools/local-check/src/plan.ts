// What each level runs, in order (CI decisions CI1, CI9, CI17). `push` is the
// fast half that every `git push` runs; `full` is every check the repo has,
// the only place they run since GitHub runs none (CI17): its proof is what
// main's branch rule requires. "Affected" is what turbo measures against the
// branch's merge base with origin/main, as ci.yml's proof job measures it
// against the main its merge commit was built on.

import type { E2eBuild } from "./e2e-matrix.ts";

export type Level = "push" | "full";

export interface Suite {
  name: string;
  cmd: string;
  args: string[];
  env?: Record<string, string | undefined>;
  /**
   * Holds the machine-wide lock while it runs: one heavy suite at a time on
   * this machine, whichever worktree asks (the e2e servers' ports are fixed,
   * and parallel agents already load the laptop).
   */
  heavy: boolean;
  /** An e2e suite: the build and projects it runs, which the proof records (CI15). */
  e2e?: { build: E2eBuild; projects: string[] };
}

export interface Host {
  platform: string;
  /** os.release(): Darwin's major version is macOS's plus 9. */
  release: string;
}

export interface Workers {
  /**
   * Playwright's --workers for each e2e run. (e2e is never cached, so its
   * arguments cost no replay; Vitest's are left alone, see the test suite.)
   */
  e2e: number;
}

export interface Plan {
  suites: Suite[];
  /** What this level does not run, said once at the start. */
  notRun: string[];
}

// Their own ports, so a run never meets `pnpm e2e` on its defaults (3100,
// 8788) or `pnpm dev` (3000, 8787) in another worktree.
const E2E_PORTS = { E2E_PORT: "3190", E2E_API_PORT: "8798" };

// The preview smoke test as CI's preview-smoke job ran it, but stopping only
// this worktree's preview (never `stop --all`: other worktrees' previews are
// someone's), and only one it started.
const PREVIEW_SMOKE = [
  'out=$(pnpm preview . --no-open) || { printf "%s\\n" "$out"; exit 1; }',
  'printf "%s\\n" "$out"',
  // A preview of this worktree already up is someone's: it answered, and is
  // left running. One still starting has not answered yet: try again later.
  'case "$out" in *"Already running"*) exit 0 ;; *Already*) echo "A preview of this worktree is starting; run this again once it is up." ; exit 1 ;; esac',
  "pnpm preview list",
  "code=$?",
  "pnpm preview stop .",
  'exit "$code"',
].join("; ");

/**
 * Playwright's WebKit needs macOS 15 (Darwin 24) or later; below that the
 * frontend's config leaves the iphone project out (frontend/e2e/phones.ts).
 */
export function runsWebKit(host: Host): boolean {
  return !(host.platform === "darwin" && Number(host.release.split(".")[0]) < 24);
}

export function e2eProjects(host: Host): string[] {
  return runsWebKit(host) ? ["chromium", "android", "iphone"] : ["chromium", "android"];
}

export function workersFrom(env: Record<string, string | undefined>): Workers {
  const read = (value: string | undefined, fallback: number) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  };
  return { e2e: read(env.ACME_E2E_WORKERS, 3) };
}

export const SWEEP_LINT: Suite = {
  name: "sweep lint",
  cmd: "pnpm",
  args: ["sweep", "lint"],
  heavy: false,
};

// backend/CLAUDE.md names docs/ files; turbo selects no package for a
// docs-only change, so this runs on every change (it was docs.yml's).
export const TRUTH_TEST: Suite = {
  name: "CLAUDE.md truth test",
  cmd: "pnpm",
  args: [
    "--filter",
    "@acme/backend",
    "exec",
    "vitest",
    "run",
    "--project",
    "unit",
    "tests/rules/claude-md.test.ts",
  ],
  heavy: false,
};

export const turbo = (...args: string[]) => ({
  cmd: "pnpm",
  args: ["exec", "turbo", "run", ...args],
});

/**
 * The suites for a level. `scope` "all" runs the turbo suites on every
 * package instead of the changed ones: there is no main to measure a change
 * from (a new project before it has a GitHub repository, or a root commit).
 */
export function plan(
  level: Level,
  affected: string[],
  host: Host,
  workers: Workers,
  scope: "affected" | "all" = "affected",
): Plan {
  const changed = scope === "all" ? [] : ["--affected"];
  const suites: Suite[] = [
    {
      name: "format, lint, types, knip",
      ...turbo("format", "lint", "typecheck", "knip", ...changed),
      heavy: false,
    },
    {
      name: "unit and browser tests",
      // One package at a time: Vitest's browser projects
      // fail to start their Chromium sessions on a saturated machine. No
      // arguments after `--`: turbo hashes them, and the task would no
      // longer replay what `pnpm check` just passed. It holds the lock too:
      // with several agents' Vitest browsers at once the machine saturated,
      // Storybook's stories timed out at 30 s, and each retry added load
      // (2026-10-17). Queued, each run finishes at full speed.
      ...turbo("test", ...changed, "--concurrency=1"),
      heavy: true,
    },
    SWEEP_LINT,
  ];
  if (level === "push") {
    return {
      suites,
      notRun: ["contract, bundle and e2e tests, the OpenNext build: pnpm check:full runs them"],
    };
  }

  suites.push(
    {
      name: "contract and bundle tests",
      ...turbo("test:contract", "test:bundle", ...changed, "--concurrency=1"),
      heavy: true,
    },
    { name: "competitors check", cmd: "pnpm", args: ["competitors", "check"], heavy: false },
    TRUTH_TEST,
  );
  const notRun: string[] = [];
  if (affected.includes("@acme/frontend")) {
    const ran = e2eProjects(host);
    const e2eArgs = [
      ...ran.map((p) => `--project=${p}`),
      `--workers=${String(workers.e2e)}`,
      // One retry, and a stray test.only fails (as CI's e2e jobs ran).
      "--retries=1",
      "--forbid-only",
    ];
    // Every project on the production build (CI4), which the proof job
    // requires (CI17).
    suites.push({
      name: "e2e, production build",
      ...turbo("e2e", "--filter=@acme/frontend", "--", ...e2eArgs),
      env: E2E_PORTS,
      heavy: true,
      e2e: { build: "production", projects: ran },
    });
    if (!runsWebKit(host)) {
      notRun.push(
        "e2e on the iphone project (WebKit needs macOS 15), so the PR's proof job refuses this proof",
      );
    }
  }
  // D4's guardrail against Next.js version lag: the deploy's OpenNext build,
  // so an incompatible Next or OpenNext upgrade fails here, not the deploy.
  if (affected.some((p) => p === "@acme/frontend" || p === "@acme/deploy")) {
    suites.push({
      name: "OpenNext build",
      cmd: "pnpm",
      args: ["--filter", "@acme/frontend", "run", "build:opennext"],
      heavy: true,
    });
  }
  // pnpm preview end to end: start this worktree, wait
  // for /api/health through Next's proxy, list, stop. It guards the dev
  // wiring in the frontend and backend too. Only a preview it started is
  // stopped: one already running for this worktree is left as it was.
  if (
    affected.some((p) => p === "@acme/preview" || p === "@acme/frontend" || p === "@acme/backend")
  ) {
    suites.push({
      name: "preview smoke",
      cmd: "sh",
      args: ["-c", PREVIEW_SMOKE],
      heavy: true,
    });
  }
  // Local first (root CLAUDE.md): pnpm dev with the network blocked, within
  // its start budget, and the skeleton's e2e spec against it. On every full
  // run: any change can make dev need the cloud. Heavy: Next dev, a browser,
  // and a start time that is only meaningful on a quiet machine.
  suites.push({
    name: "offline",
    cmd: "node",
    args: ["tools/local-check/src/cli.ts", "offline"],
    heavy: true,
  });
  // The rename a new project runs, on a copy of HEAD, then `pnpm check` in
  // the renamed copy (design §5, TB93). Here rather than in `pnpm check`, so
  // no check runs a check inside it. On every full run: any change can add a
  // placeholder the rename misses. Heavy: an install and a whole check.
  suites.push({
    name: "rename-copy",
    cmd: "node",
    args: ["tools/bootstrap/src/rename-copy.ts"],
    heavy: true,
  });
  return { suites, notRun };
}
