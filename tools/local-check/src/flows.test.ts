import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Run, Stream } from "./exec.ts";

import { checkFull, type Deps, postWhenPushed, prePush } from "./flows.ts";
import { readPass } from "./record.ts";

const SHA = "c".repeat(40);
const SLUG = "acme-owner/acme";

interface World {
  pr?: { number: number; isDraft: boolean; state: string } | "none" | "offline";
  /** Whether the commit is on GitHub, asked each time. */
  pushed?: () => boolean;
  dirty?: boolean;
  affected?: string[];
  /** A suite whose args contain this fails. */
  failing?: string;
  /** The jobs named `proof` in the commit's failed run. */
  proofJobs?: { name: string; conclusion: string | null }[];
  rerunFails?: boolean;
  /** process.version of the shell running the check; the repo is pinned to 24. */
  node?: string;
  /** Called as each suite runs, to change the world meanwhile. */
  during?: (w: World) => void;
  /** HEAD is already on origin/main (its own merge base). */
  onMain?: boolean;
  /** No origin remote (a project before bootstrap step 3), or one not on GitHub. */
  origin?: "none" | "elsewhere";
  /** Every package in the workspace, as `turbo ls` lists them without --affected. */
  packages?: string[];
}

function world(w: World = {}) {
  const gitDir = mkdtempSync(path.join(tmpdir(), "local-check-git-"));
  const calls: string[] = [];
  const streamed: { args: string; env: Record<string, string | undefined> | undefined }[] = [];
  const logs: string[] = [];
  const posted: string[] = [];
  let clock = 0;
  const run: Run = (cmd, args) => {
    const line = [cmd, ...args].join(" ");
    calls.push(line);
    const answers: [RegExp, () => string][] = [
      [
        /^git merge-base HEAD origin\/main$/,
        () => {
          if (w.origin === "none") throw new Error("fatal: Not a valid object name origin/main");
          return w.onMain === true ? SHA : "b".repeat(40);
        },
      ],
      [/^git rev-parse --verify --quiet HEAD\^$/, () => "c".repeat(40)],
      [/^git rev-parse HEAD$/, () => SHA],
      [/^git rev-parse --abbrev-ref HEAD$/, () => "stage1/x"],
      [/^git rev-parse --git-common-dir$/, () => gitDir],
      [/^git status/, () => (w.dirty === true ? "?? new.test.ts\n" : "")],
      [
        /^git remote get-url origin$/,
        () => {
          if (w.origin === "none") throw new Error("error: No such remote 'origin'");
          if (w.origin === "elsewhere") return "https://git.example.test/acme.git";
          return `https://github.com/${SLUG}.git`;
        },
      ],
      [
        /^pnpm exec turbo ls --output=json$/,
        () =>
          JSON.stringify({
            packages: { items: (w.packages ?? ["@acme/frontend"]).map((name) => ({ name })) },
          }),
      ],
      [
        /^pnpm exec turbo ls/,
        () =>
          JSON.stringify({
            packages: { items: (w.affected ?? ["@acme/frontend"]).map((name) => ({ name })) },
          }),
      ],
      [
        /^gh pr view/,
        () => {
          const pr = w.pr ?? "none";
          if (pr === "none")
            throw new Error("gh pr view failed: no pull requests found for branch");
          if (pr === "offline")
            throw new Error("gh pr view failed: error connecting to api.github.com");
          return JSON.stringify(pr);
        },
      ],
      [
        /^gh api repos\/[^/]+\/[^/]+\/commits\//,
        () => {
          if (w.pushed?.() !== true) throw new Error("gh api failed: No commit found for SHA");
          return SHA;
        },
      ],
      [/^gh api --method POST/, () => (posted.push(line), "")],
      [/actions\/runs\?head_sha=/, () => "[11]"],
      [
        /actions\/runs\/11\/jobs/,
        () => JSON.stringify(w.proofJobs ?? [{ name: "proof", conclusion: "failure" }]),
      ],
      [
        /^gh run rerun/,
        () => {
          if (w.rerunFails === true) throw new Error("gh run rerun failed: already running");
          return "";
        },
      ],
      [/^gh pr ready/, () => ""],
    ];
    const answer = answers.find(([re]) => re.test(line));
    if (answer === undefined) throw new Error(`unexpected command: ${line}`);
    return answer[1]();
  };
  const stream: Stream = (_cmd, args, opts) => {
    const joined = args.join(" ");
    streamed.push({ args: joined, env: opts.env });
    clock += 60_000;
    w.during?.(w);
    return Promise.resolve(w.failing !== undefined && joined.includes(w.failing) ? 1 : 0);
  };
  const later: string[] = [];
  const deps: Deps = {
    run,
    stream,
    root: "/w/a",
    host: { platform: "linux", release: "6.8.0" },
    env: {},
    node: { version: w.node ?? "v24.21.0", pinned: "24.21.0\n" },
    log: (line) => logs.push(line),
    now: () => clock,
    sleep: () => {
      clock += 3000;
      return Promise.resolve();
    },
    postLater: (sha) => later.push(sha),
    lock: { pollMs: 5 },
  };
  const records = path.join(gitDir, "acme", "check-full");
  return { deps, calls, streamed, logs, posted, later, records, gitDir };
}

describe("prePush", () => {
  it("a branch with no PR: the fast suites only, and nothing posted", async () => {
    const w = world();
    expect(await prePush(w.deps)).toBe(0);
    expect(w.streamed).toHaveLength(3);
    expect(w.later).toEqual([]);
  });

  it("measures affected from the merge base, as the proof job does from main", async () => {
    const w = world();
    await prePush(w.deps);
    expect(w.streamed.every((s) => s.env?.TURBO_SCM_BASE === "b".repeat(40))).toBe(true);
  });

  it("CI19: a commit already on main is measured from its first parent, not from itself", async () => {
    const w = world({ onMain: true });
    await prePush(w.deps);
    expect(w.streamed.length).toBeGreaterThan(0);
    expect(w.streamed.every((s) => s.env?.TURBO_SCM_BASE === "c".repeat(40))).toBe(true);
  });

  it("stops at the first failing suite, before asking GitHub anything", async () => {
    const w = world({ failing: "typecheck" });
    expect(await prePush(w.deps)).toBe(1);
    expect(w.streamed).toHaveLength(1);
    expect(w.calls.some((c) => c.startsWith("gh "))).toBe(false);
    expect(w.logs.at(-1)).toBe("local-check: format, lint, types, knip failed.");
  });

  it("a draft PR: the fast suites only (its proof job skips drafts)", async () => {
    const w = world({ pr: { number: 74, isDraft: true, state: "OPEN" } });
    expect(await prePush(w.deps)).toBe(0);
    expect(w.streamed).toHaveLength(3);
  });

  it("a ready PR: runs pnpm check:full before the push, records it, posts once pushed", async () => {
    const w = world({ pr: { number: 74, isDraft: false, state: "OPEN" } });
    expect(await prePush(w.deps)).toBe(0);
    expect(w.streamed.map((s) => s.args)).toEqual(
      expect.arrayContaining([expect.stringContaining("e2e --filter=@acme/frontend")]),
    );
    expect(w.streamed).toHaveLength(3 + 11);
    expect(readPass(w.records, SHA)?.sha).toBe(SHA);
    expect(w.later).toEqual([SHA]);
    expect(existsSync(path.join(w.gitDir, "acme", "heavy.lock"))).toBe(false);
  });

  it("a ready PR whose commit already passed: no second full run", async () => {
    const w = world({ pr: { number: 74, isDraft: false, state: "OPEN" } });
    await prePush(w.deps);
    const again = world({ pr: { number: 74, isDraft: false, state: "OPEN" } });
    again.deps.run = w.deps.run; // the same git data
    expect(await prePush(again.deps)).toBe(0);
    expect(again.streamed).toHaveLength(3);
    expect(again.later).toEqual([SHA]);
  });

  it("a ready PR with uncommitted work: refuses, since a commit is what gets proven", async () => {
    const w = world({ pr: { number: 74, isDraft: false, state: "OPEN" }, dirty: true });
    expect(await prePush(w.deps)).toBe(1);
    expect(w.logs.at(-1)).toMatch(/^local-check: commit first/);
  });

  it("GitHub unreachable: lets the push go and says the proof job needs the proof", async () => {
    const w = world({ pr: "offline" });
    expect(await prePush(w.deps)).toBe(0);
    expect(w.logs.join("\n")).toMatch(/could not ask GitHub[\s\S]*run pnpm check:full/);
  });
});

describe("checkFull", () => {
  it("refuses a worktree with changes, running nothing", async () => {
    const w = world({ dirty: true });
    expect(await checkFull(w.deps, { ready: false })).toBe(1);
    expect(w.streamed).toEqual([]);
  });

  it("not pushed yet: runs everything, records the pass, and leaves the posting to the push", async () => {
    const w = world();
    expect(await checkFull(w.deps, { ready: false })).toBe(0);
    expect(w.streamed.map((s) => s.args.split(" --")[0])).toEqual([
      "exec turbo run format lint typecheck knip",
      "exec turbo run test",
      "sweep lint",
      "exec turbo run test:contract test:bundle",
      "competitors check",
      "--filter @acme/backend exec vitest run",
      "exec turbo run e2e",
      "--filter @acme/frontend run build:opennext",
      "-c out=$(pnpm preview .",
      "tools/local-check/src/cli.ts offline",
      "tools/bootstrap/src/rename-copy.ts",
    ]);
    expect(readPass(w.records, SHA)?.seconds).toBe(660);
    expect(w.posted).toEqual([]);
    expect(w.logs.at(-1)).toMatch(/Push it: the pre-push hook posts the proof/);
  });

  it("pushed: posts the proof on the commit and re-runs the proof job that waited for it", async () => {
    const w = world({ pushed: () => true });
    expect(await checkFull(w.deps, { ready: false })).toBe(0);
    expect(w.posted).toHaveLength(1);
    expect(w.posted[0]).toContain(`repos/${SLUG}/statuses/${SHA}`);
    expect(w.posted[0]).toContain("state=success");
    expect(w.posted[0]).toContain("context=local/check-full");
    expect(w.posted[0]).toMatch(
      /description=\[e2e production:[^\]]+\] passed in 11m00s: format, lint, types, knip, /,
    );
    expect(w.calls).toContain(`gh run rerun 11 --failed --repo ${SLUG}`);
  });

  it("a commit that already passed: posts without running anything again", async () => {
    const w = world({ pushed: () => true });
    await checkFull(w.deps, { ready: false });
    const ran = w.streamed.length;
    expect(await checkFull(w.deps, { ready: false })).toBe(0);
    expect(w.streamed).toHaveLength(ran);
    expect(w.posted).toHaveLength(2);
  });

  it("a failing suite: nothing recorded, nothing posted", async () => {
    const w = world({ pushed: () => true, failing: "e2e" });
    expect(await checkFull(w.deps, { ready: false })).toBe(1);
    expect(readPass(w.records, SHA)).toBeUndefined();
    expect(w.posted).toEqual([]);
  });

  it("--ready marks the branch's draft PR ready after posting", async () => {
    const w = world({ pushed: () => true, pr: { number: 74, isDraft: true, state: "OPEN" } });
    expect(await checkFull(w.deps, { ready: true })).toBe(0);
    expect(w.calls.indexOf("gh pr ready 74")).toBeGreaterThan(
      w.calls.findIndex((c) => c.startsWith("gh api --method POST")),
    );
  });

  // CI17: a Dependabot PR is checked out and proven here; its commit is not
  // this user's, and the PR is not a draft.
  it("a Dependabot PR: posts on its head, re-runs its proof job, and --ready marks nothing", async () => {
    const w = world({ pushed: () => true, pr: { number: 90, isDraft: false, state: "OPEN" } });
    expect(await checkFull(w.deps, { ready: true })).toBe(0);
    expect(w.posted).toHaveLength(1);
    expect(w.posted[0]).toContain(`repos/${SLUG}/statuses/${SHA}`);
    expect(w.calls).toContain(`gh run rerun 11 --failed --repo ${SLUG}`);
    expect(w.calls.some((c) => c.startsWith("gh pr ready"))).toBe(false);
    expect(w.calls.some((c) => /\b(log|show|config user)\b/.test(c))).toBe(false);
  });

  it("--ready with no open PR fails, after posting", async () => {
    const w = world({ pushed: () => true });
    expect(await checkFull(w.deps, { ready: true })).toBe(1);
    expect(w.posted).toHaveLength(1);
  });
});

// A new project has no GitHub repository until bootstrap step 3, and no
// origin/main to measure a change from: every package counts as changed, the
// pass is recorded here, and nothing is posted.
describe("checkFull with no GitHub remote", () => {
  const ALL = ["@acme/backend", "@acme/deploy", "@acme/frontend", "@acme/preview"];

  it("runs every suite on every package, records the pass, posts nothing and succeeds", async () => {
    const w = world({ origin: "none", packages: ALL });
    expect(await checkFull(w.deps, { ready: false })).toBe(0);
    const names = w.streamed.map((s) => s.args);
    expect(names.some((a) => a.includes("e2e"))).toBe(true);
    expect(names.some((a) => a.includes("build:opennext"))).toBe(true);
    expect(names.some((a) => a.includes("preview"))).toBe(true);
    // Not limited to a change: no --affected, and no base to measure from.
    expect(names.filter((a) => a.includes("--affected"))).toEqual([]);
    expect(readPass(w.records, SHA)).toBeDefined();
    expect(w.posted).toEqual([]);
    expect(w.calls.some((c) => c.startsWith("gh "))).toBe(false);
    expect(w.logs).toContain("local-check: no origin/main: every package counts as changed.");
    expect(w.logs).toContain("local-check: no GitHub remote: recorded, nothing posted.");
  });

  it("with --ready, says there is no PR to mark ready, after recording", async () => {
    const w = world({ origin: "none", packages: ALL });
    expect(await checkFull(w.deps, { ready: true })).toBe(1);
    expect(readPass(w.records, SHA)).toBeDefined();
    expect(w.logs.join("\n")).toContain("no PR to mark ready");
  });

  it("treats an origin that is not on GitHub the same way", async () => {
    const w = world({ origin: "elsewhere", affected: ["@acme/frontend"] });
    expect(await checkFull(w.deps, { ready: false })).toBe(0);
    expect(w.logs).toContain("local-check: no GitHub remote: recorded, nothing posted.");
    expect(w.posted).toEqual([]);
  });
});

describe("the proof's e2e coverage (CI15)", () => {
  it("records the projects that ran on the build, and posts them first in the description", async () => {
    const w = world({ pushed: () => true });
    expect(await checkFull(w.deps, { ready: false })).toBe(0);
    const e2e = { production: ["chromium", "android", "iphone"] };
    expect(readPass(w.records, SHA)?.e2e).toEqual(e2e);
    expect(w.posted[0]).toContain(
      "description=[e2e production:chromium,android,iphone node24] passed in",
    );
  });

  it("a host without WebKit records, and so claims, only what it ran", async () => {
    const w = world({ pushed: () => true });
    w.deps.host = { platform: "darwin", release: "23.6.0" };
    await checkFull(w.deps, { ready: false });
    expect(readPass(w.records, SHA)?.e2e).toEqual({
      production: ["chromium", "android"],
    });
  });

  it("a branch that does not touch the frontend claims no e2e", async () => {
    const w = world({ pushed: () => true, affected: ["@acme/backend"] });
    await checkFull(w.deps, { ready: false });
    expect(readPass(w.records, SHA)?.e2e).toEqual({ production: [] });
    expect(w.posted[0]).toContain("description=[e2e none node24] passed in");
  });
});

describe("re-running and changes during a run", () => {
  it("re-runs only a run whose proof job failed", async () => {
    const w = world({
      pushed: () => true,
      proofJobs: [{ name: "proof", conclusion: "success" }],
    });
    expect(await checkFull(w.deps, { ready: false })).toBe(0);
    expect(w.calls.some((c) => c.startsWith("gh run rerun"))).toBe(false);
  });

  it("a re-run GitHub refuses is reported, and --ready still marks the PR ready", async () => {
    const w = world({
      pushed: () => true,
      rerunFails: true,
      pr: { number: 74, isDraft: true, state: "OPEN" },
    });
    expect(await checkFull(w.deps, { ready: true })).toBe(0);
    expect(w.logs).toContain(
      "local-check: could not re-run CI run 11; re-run its failed jobs by hand",
    );
    expect(w.calls).toContain("gh pr ready 74");
  });

  it("a worktree changed during the run proves nothing: no record, no proof", async () => {
    const w = world({ pushed: () => true, during: (state) => (state.dirty = true) });
    expect(await checkFull(w.deps, { ready: false })).toBe(1);
    expect(readPass(w.records, SHA)).toBeUndefined();
    expect(w.posted).toEqual([]);
    expect(w.logs.join("\n")).toMatch(/it changed during the run/);
  });
});

describe("postWhenPushed", () => {
  it("waits for the push to land, then posts", async () => {
    let asks = 0;
    const w = world({ pushed: () => ++asks > 2 });
    await checkFull(w.deps, { ready: false }); // records; not pushed yet (asks 1)
    expect(await postWhenPushed(w.deps, SHA, 180)).toBe(0);
    expect(w.posted).toHaveLength(1);
  });

  it("gives up after the wait, saying how to post by hand", async () => {
    const w = world({ pushed: () => false });
    await checkFull(w.deps, { ready: false });
    expect(await postWhenPushed(w.deps, SHA, 10)).toBe(1);
    expect(w.logs.at(-1)).toMatch(/did not reach GitHub in 10s; run pnpm check:full/);
  });

  it("posts nothing for a commit that never passed here", async () => {
    const w = world({ pushed: () => true });
    expect(await postWhenPushed(w.deps, SHA, 10)).toBe(1);
    expect(w.posted).toEqual([]);
  });
});

describe("the repo's Node (CI16, acme-txh2)", () => {
  it("check:full refuses another Node major, running and recording nothing", async () => {
    const w = world({ node: "v26.8.1", pushed: () => true });
    expect(await checkFull(w.deps, { ready: false })).toBe(1);
    expect(w.streamed).toEqual([]);
    expect(w.calls).toEqual([]);
    expect(readPass(w.records, SHA)).toBeUndefined();
    expect(w.logs.join("\n")).toMatch(
      /Node v26\.8\.1, but the repo runs Node 24[\s\S]*pnpm env use --global 24/,
    );
  });

  it("check:full on the repo's major, whatever its minor, runs and records the major", async () => {
    const w = world({ node: "v24.9.0", pushed: () => true });
    expect(await checkFull(w.deps, { ready: false })).toBe(0);
    expect(readPass(w.records, SHA)?.node).toBe(24);
    expect(w.posted[0]).toMatch(/description=\[e2e [^\]]* node24\] passed in/);
  });

  it("a proof without e2e still names its Node, which the proof job checks (CI17)", async () => {
    const w = world({ pushed: () => true, affected: ["@acme/backend"] });
    await checkFull(w.deps, { ready: false });
    expect(readPass(w.records, SHA)?.node).toBe(24);
    expect(w.posted[0]).toContain("description=[e2e none node24] passed in");
  });

  it("check:push warns on another major and still runs its fast suites", async () => {
    const w = world({ node: "v26.8.1" });
    expect(await prePush(w.deps)).toBe(0);
    expect(w.streamed).toHaveLength(3);
    expect(w.logs.join("\n")).toMatch(/Node v26\.8\.1[\s\S]*A warning/);
  });

  it("check:push is quiet on the repo's major", async () => {
    const w = world();
    await prePush(w.deps);
    expect(w.logs.join("\n")).not.toMatch(/Node v2/);
  });

  it("a ready PR's push on another major stops instead of running check:full there", async () => {
    const w = world({ node: "v26.8.1", pr: { number: 74, isDraft: false, state: "OPEN" } });
    expect(await prePush(w.deps)).toBe(1);
    expect(w.streamed).toHaveLength(3);
    expect(readPass(w.records, SHA)).toBeUndefined();
    expect(w.logs.at(-1)).toMatch(/refuses on this Node/);
  });

  it("with no readable pin there is nothing to hold the shell to", async () => {
    const w = world({ node: "v26.8.1" });
    w.deps.node = { version: "v26.8.1", pinned: undefined };
    expect(await checkFull(w.deps, { ready: false })).toBe(0);
  });
});
