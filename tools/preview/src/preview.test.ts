import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Deps } from "./preview.ts";
import type { Launch } from "./processes.ts";
import type { PreviewState } from "./state.ts";

import { portsForSlot, slotFor } from "./naming.ts";
import { LEGACY_API_PORT, list, removalRefusal, stop, up } from "./preview.ts";
import { markCreated, readState, writeState } from "./state.ts";
import { scriptedRunner, tempRepo } from "./testing.ts";

const INSTALL = "pnpm install --frozen-lockfile --prefer-offline";

function repoWithApp(options: { backend: boolean; devPort: boolean }) {
  const repo = tempRepo();
  repo.commit("frontend/package.json", "{}\n", "frontend");
  if (options.backend) {
    repo.commit("backend/package.json", "{}\n", "backend");
    repo.commit(
      "backend/src/entries/dev/server.ts",
      options.devPort ? "const { apiPort } = loadDevConfig();\n" : "const PORT = 8787;\n",
      "dev server",
    );
  }
  repo.git(["push", "origin", "main"]);
  return repo;
}

function fakeDeps(cwd: string, overrides: Partial<Deps> = {}) {
  const launched: Launch[] = [];
  const killed: string[] = [];
  const out: string[] = [];
  const opened: string[] = [];
  let nextPid = 100;
  const listening = new Set<number>();
  const deps: Deps = {
    cwd,
    isListening: (port) => Promise.resolve(listening.has(port)),
    isPortFree: (port) => Promise.resolve(!listening.has(port)),
    launch: (launch) => {
      launched.push(launch);
      return nextPid++;
    },
    now: () => new Date("2026-09-26T10:00:00.000Z"),
    open: (url) => {
      opened.push(url);
      return Promise.resolve();
    },
    out: (line) => out.push(line),
    run: scriptedRunner({ [INSTALL]: {} }),
    signals: {
      isAlive: () => true,
      kill: (pid, signal) => killed.push(`${String(pid)}:${signal}`),
      sleep: () => Promise.resolve(),
    },
    waitForHealth: () => Promise.resolve(true),
    withLock: (fn) => fn(),
    ...overrides,
  };
  return { deps, killed, launched, listening, opened, out };
}

describe("up", () => {
  it("creates the worktree, starts the API and Next on its ports, and opens the URL", async () => {
    const repo = repoWithApp({ backend: true, devPort: true });
    repo.git(["branch", "claude/shop-111111"]);
    const { deps, launched, opened, out } = fakeDeps(repo.root);

    expect(await up("claude/shop-111111", { open: true }, deps)).toBe(0);

    const tree = path.join(repo.root, ".claude/worktrees/preview-shop");
    const state = readState(tree);
    expect(state).toMatchObject({ branch: "claude/shop-111111", slug: "shop", version: 1 });
    const { api, web } = state?.ports ?? { api: 0, web: 0 };
    expect(launched).toEqual([
      expect.objectContaining({
        args: ["--filter", "@acme/backend", "dev"],
        command: "pnpm",
        cwd: tree,
        env: { DEV_API_PORT: String(api), DEV_SITE_URL: `http://shop.localhost:${String(web)}` },
      }),
      expect.objectContaining({
        args: ["exec", "next", "dev", "-p", String(web), "-H", "127.0.0.1"],
        command: "pnpm",
        cwd: path.join(tree, "frontend"),
        env: { DEV_API_PORT: String(api) },
      }),
    ]);
    for (const one of launched) expect(one).not.toHaveProperty("defaultEnv");
    expect(opened).toEqual([`http://shop.localhost:${String(web)}`]);
    expect(out.join("\n")).toMatch(/Ready: http:\/\/shop\.localhost/);
  });

  it("only reprints the URL when the preview is already running", async () => {
    const repo = repoWithApp({ backend: true, devPort: true });
    const { deps, launched, listening, out } = fakeDeps(repo.root);
    expect(await up(".", { open: false }, deps)).toBe(0);
    const web = readState(repo.root)?.ports.web ?? 0;
    listening.add(web);
    launched.length = 0;
    expect(await up(".", { open: false }, deps)).toBe(0);
    expect(launched).toEqual([]);
    expect(out.at(-1)).toMatch(/Already running/);
  });

  it("uses the slug of the folder name on a detached HEAD", async () => {
    const repo = repoWithApp({ backend: true, devPort: true });
    repo.git(["checkout", "--detach"]);
    const { deps } = fakeDeps(repo.root);
    expect(await up(".", { open: false }, deps)).toBe(0);
    expect(readState(repo.root)?.slug).toBe("repo");
  });

  it("stops what it started and shows the logs when health never comes", async () => {
    const repo = repoWithApp({ backend: true, devPort: true });
    const { deps, killed, out } = fakeDeps(repo.root, {
      waitForHealth: () => Promise.resolve(false),
    });
    expect(await up(".", { open: false }, deps)).toBe(1);
    expect(killed).toEqual(["100:SIGTERM", "101:SIGTERM", "100:SIGKILL", "101:SIGKILL"]);
    expect(readState(repo.root)).toBeUndefined();
    expect(out.join("\n")).toMatch(/api\.log[\s\S]*web\.log/);
  });

  it("gives a branch that predates DEV_API_PORT the fixed API port 8787", async () => {
    const repo = repoWithApp({ backend: true, devPort: false });
    const { deps } = fakeDeps(repo.root);
    expect(await up(".", { open: false }, deps)).toBe(0);
    expect(readState(repo.root)?.ports.api).toBe(LEGACY_API_PORT);
  });

  it("refuses a second pre-DEV_API_PORT preview while 8787 is taken", async () => {
    const repo = repoWithApp({ backend: true, devPort: false });
    const { deps, launched, listening, out } = fakeDeps(repo.root);
    listening.add(LEGACY_API_PORT);
    expect(await up(".", { open: false }, deps)).toBe(1);
    expect(launched).toEqual([]);
    expect(out.join("\n")).toMatch(/8787/);
  });

  it("starts only Next for a branch without backend/, and checks / for health", async () => {
    const repo = repoWithApp({ backend: false, devPort: false });
    const urls: string[] = [];
    const { deps, launched } = fakeDeps(repo.root, {
      waitForHealth: (url) => {
        urls.push(url);
        return Promise.resolve(true);
      },
    });
    expect(await up(".", { open: false }, deps)).toBe(0);
    expect(launched).toHaveLength(1);
    expect(urls[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(readState(repo.root)?.pids.api).toBeUndefined();
  });

  it("explains an unknown target and lists what can be previewed", async () => {
    const repo = repoWithApp({ backend: true, devPort: true });
    const { deps, out } = fakeDeps(repo.root);
    expect(await up("no-such-thing", { open: false }, deps)).toBe(1);
    expect(out.join("\n")).toMatch(/No branch, PR, bead or worktree[\s\S]*Worktrees:/);
  });
});

describe("list and stop", () => {
  const running = (worktree: string, web = 4300): PreviewState => ({
    bead: undefined,
    branch: "claude/shop-111111",
    pids: { api: 7, web: 8 },
    ports: { api: web + 1, web },
    slug: "shop",
    startedAt: "2026-09-26T09:00:00.000Z",
    target: "shop",
    version: 1,
  });

  it("stops a preview by slug", async () => {
    const repo = repoWithApp({ backend: true, devPort: true });
    writeState(repo.root, running(repo.root));
    const { deps, killed, listening } = fakeDeps(repo.root);
    listening.add(4300);
    expect(await stop("shop", { all: false, remove: false }, deps)).toBe(0);
    expect(killed).toContain("8:SIGTERM");
    expect(readState(repo.root)).toBeUndefined();
  });

  it("never signals PIDs whose web port is no longer listening (a reboot reused them)", async () => {
    const repo = repoWithApp({ backend: true, devPort: true });
    writeState(repo.root, running(repo.root));
    const { deps, killed, out } = fakeDeps(repo.root);
    expect(await list(deps)).toBe(0);
    expect(killed).toEqual([]);
    expect(readState(repo.root)).toBeUndefined();
    expect(out.join("\n")).toMatch(/No previews running/);
  });

  it("lists running previews with their URL", async () => {
    const repo = repoWithApp({ backend: true, devPort: true });
    writeState(repo.root, running(repo.root));
    const { deps, listening, out } = fakeDeps(repo.root);
    listening.add(4300);
    expect(await list(deps)).toBe(0);
    expect(out.join("\n")).toMatch(/shop\s+claude\/shop-111111\s+http:\/\/shop\.localhost:4300/);
  });
});

describe("removalRefusal", () => {
  it("refuses the main checkout and agents' worktrees: preview did not create them", async () => {
    const repo = repoWithApp({ backend: true, devPort: true });
    const { deps } = fakeDeps(repo.root);
    expect(await removalRefusal(repo.root, deps)).toMatch(/did not create/);
  });

  it("refuses uncommitted changes, and commits on no remote", async () => {
    const repo = repoWithApp({ backend: true, devPort: true });
    const tree = path.join(repo.root, ".claude/worktrees/preview-w");
    repo.git(["worktree", "add", "-b", "w", tree]);
    markCreated(tree);
    const { deps } = fakeDeps(repo.root);
    writeFileSync(path.join(tree, "dirty.txt"), "x\n");
    expect(await removalRefusal(tree, deps)).toMatch(/uncommitted/);
    repo.git(["add", "dirty.txt"], tree);
    repo.git(["commit", "-m", "local only"], tree);
    expect(await removalRefusal(tree, deps)).toMatch(/1 commit/);
  });

  it("removes a clean worktree preview created", async () => {
    const repo = repoWithApp({ backend: true, devPort: true });
    repo.git(["push", "origin", "main:claude/gone-111111"]);
    repo.git(["fetch", "origin"]);
    const { deps } = fakeDeps(repo.root);
    expect(await up("claude/gone-111111", { open: false }, deps)).toBe(0);
    const tree = path.join(repo.root, ".claude/worktrees/preview-gone");
    mkdirSync(path.join(tree, "node_modules"), { recursive: true });
    expect(await stop("gone", { all: false, remove: true }, deps)).toBe(0);
    expect(repo.git(["worktree", "list"])).not.toContain("preview-gone");
  });
});

describe("previews that are starting, half-dead, or side by side", () => {
  const NOW = Date.parse("2026-09-26T10:00:00.000Z");
  const stateAt = (startedAt: number, ports = { api: 4301, web: 4300 }): PreviewState => ({
    bead: undefined,
    branch: "claude/shop-111111",
    pids: { api: 7, web: 8 },
    ports,
    slug: "shop",
    startedAt: new Date(startedAt).toISOString(),
    target: ".",
    version: 1,
  });

  it("keeps a preview that is still starting (its port is not bound yet)", async () => {
    const repo = repoWithApp({ backend: true, devPort: true });
    writeState(repo.root, stateAt(NOW - 5000));
    const { deps, killed, out } = fakeDeps(repo.root);
    expect(await list(deps)).toBe(0);
    expect(readState(repo.root)).toBeDefined();
    expect(killed).toEqual([]);
    expect(out.join("\n")).toMatch(/shop\s.*starting/);
  });

  it("stops the API of a preview whose web server died", async () => {
    const repo = repoWithApp({ backend: true, devPort: true });
    writeState(repo.root, stateAt(NOW - 3_600_000));
    const { deps, killed, listening } = fakeDeps(repo.root, {
      signals: {
        isAlive: (pid) => pid === 7,
        kill: (pid, signal) => killed.push(`${String(pid)}:${signal}`),
        sleep: () => Promise.resolve(),
      },
    });
    listening.add(4301);
    await list(deps);
    expect(killed).toContain("7:SIGTERM");
    expect(killed.some((entry) => entry.startsWith("8:"))).toBe(false);
    expect(readState(repo.root)).toBeUndefined();
  });

  it("never hands out ports another preview reserved but has not bound yet", async () => {
    const repo = repoWithApp({ backend: true, devPort: true });
    const other = path.join(repo.root, ".claude/worktrees/other");
    repo.git(["worktree", "add", "-b", "other", other]);
    const mine = portsForSlot(slotFor(repo.root));
    writeState(other, { ...stateAt(NOW - 1000, mine), slug: "other" });
    const { deps } = fakeDeps(repo.root);
    expect(await up(".", { open: false }, deps)).toBe(0);
    const ports = readState(repo.root)?.ports;
    expect(ports?.web).not.toBe(mine.web);
    expect(ports?.api).not.toBe(mine.api);
  });

  it("refuses a pre-DEV_API_PORT branch while another preview is starting on 8787", async () => {
    const repo = repoWithApp({ backend: true, devPort: false });
    const other = path.join(repo.root, ".claude/worktrees/other");
    repo.git(["worktree", "add", "-b", "other", other]);
    writeState(other, {
      ...stateAt(NOW - 1000, { api: LEGACY_API_PORT, web: 4500 }),
      slug: "other",
    });
    const { deps, launched, out } = fakeDeps(repo.root);
    expect(await up(".", { open: false }, deps)).toBe(1);
    expect(launched).toEqual([]);
    expect(out.join("\n")).toMatch(/8787/);
  });

  it("'stop .' stops this worktree's preview only", async () => {
    const repo = repoWithApp({ backend: true, devPort: true });
    const other = path.join(repo.root, ".claude/worktrees/other");
    repo.git(["worktree", "add", "-b", "other", other]);
    writeState(repo.root, stateAt(NOW - 3_600_000, { api: 4301, web: 4300 }));
    writeState(other, { ...stateAt(NOW - 3_600_000, { api: 4303, web: 4302 }), slug: "other" });
    const { deps, listening } = fakeDeps(repo.root);
    listening.add(4300).add(4302);
    expect(await stop(".", { all: false, remove: false }, deps)).toBe(0);
    expect(readState(repo.root)).toBeUndefined();
    expect(readState(other)).toBeDefined();
  });
});

it("chooses ports and launches only while holding the repo-wide preview lock", async () => {
  const repo = repoWithApp({ backend: true, devPort: true });
  let held = false;
  const launchedInside: boolean[] = [];
  const { deps } = fakeDeps(repo.root, {
    launch: () => {
      launchedInside.push(held);
      return 100 + launchedInside.length;
    },
    withLock: async <T>(fn: () => Promise<T>) => {
      held = true;
      try {
        return await fn();
      } finally {
        held = false;
      }
    },
  });
  expect(await up(".", { open: false }, deps)).toBe(0);
  expect(launchedInside).toEqual([true, true]);
});

it("previews a PR whose branch this machine has never fetched", async () => {
  const repo = repoWithApp({ backend: true, devPort: true });
  repo.git(["push", "origin", "main:claude/cloud-333333"]);
  repo.git(["update-ref", "-d", "refs/remotes/origin/claude/cloud-333333"]);
  const { deps } = fakeDeps(repo.root, {
    run: scriptedRunner({
      "gh pr view 12 --json headRefName": { stdout: '{"headRefName":"claude/cloud-333333"}' },
      [INSTALL]: {},
    }),
  });
  expect(await up("#12", { open: false }, deps)).toBe(0);
  expect(readState(path.join(repo.root, ".claude/worktrees/preview-cloud"))?.branch).toBe(
    "claude/cloud-333333",
  );
});
