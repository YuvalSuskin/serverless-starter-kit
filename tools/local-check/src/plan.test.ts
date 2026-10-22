import { describe, expect, it } from "vitest";

import { e2eProjects, plan, runsWebKit, workersFrom } from "./plan.ts";

const linux = { platform: "linux", release: "6.8.0" };
const sonoma = { platform: "darwin", release: "23.6.0" }; // macOS 14
const sequoia = { platform: "darwin", release: "24.1.0" }; // macOS 15
const workers = { e2e: 3 };

describe("plan", () => {
  it("push: the fast half, tests one package at a time, nothing turbo would hash", () => {
    const p = plan("push", ["@acme/frontend"], linux, workers);
    expect(p.suites.map((s) => s.name)).toEqual([
      "format, lint, types, knip",
      "unit and browser tests",
      "sweep lint",
    ]);
    expect(p.suites[1]?.args).toEqual([
      "exec",
      "turbo",
      "run",
      "test",
      "--affected",
      "--concurrency=1",
    ]);
    // Only the browser tests queue for the machine; the fast suites never wait.
    expect(p.suites.filter((s) => s.heavy).map((s) => s.name)).toEqual(["unit and browser tests"]);
  });

  it("full: adds contract and bundle tests, and e2e when the frontend is affected", () => {
    const p = plan("full", ["@acme/frontend", "@acme/backend"], linux, workers);
    expect(p.suites.map((s) => s.name)).toEqual([
      "format, lint, types, knip",
      "unit and browser tests",
      "sweep lint",
      "contract and bundle tests",
      "competitors check",
      "CLAUDE.md truth test",
      "e2e, production build",
      "OpenNext build",
      "preview smoke",
      "offline",
      "rename-copy",
    ]);
    const e2e = p.suites.find((s) => s.name === "e2e, production build");
    expect(e2e?.args.slice(-6)).toEqual([
      "--project=chromium",
      "--project=android",
      "--project=iphone",
      "--workers=3",
      "--retries=1",
      "--forbid-only",
    ]);
    expect(e2e?.env).toEqual({ E2E_PORT: "3190", E2E_API_PORT: "8798" });
    expect(p.suites.filter((s) => s.heavy).map((s) => s.name)).toEqual([
      "unit and browser tests",
      "contract and bundle tests",
      "e2e, production build",
      "OpenNext build",
      "preview smoke",
      "offline",
      "rename-copy",
    ]);
    expect(p.notRun).toEqual([]);
  });

  // CI17: what CI's opennext-build, preview-smoke and docs jobs checked runs
  // here, when the same packages are affected.
  it("full: the OpenNext build for the frontend or the deploy, the preview smoke for preview, frontend or backend", () => {
    const names = (affected: string[]) =>
      plan("full", affected, linux, workers).suites.map((s) => s.name);
    expect(names(["@acme/deploy"])).toContain("OpenNext build");
    expect(names(["@acme/deploy"])).not.toContain("preview smoke");
    for (const p of ["@acme/preview", "@acme/backend"]) {
      expect(names([p])).toContain("preview smoke");
      expect(names([p])).not.toContain("OpenNext build");
    }
    expect(names([])).toEqual([
      "format, lint, types, knip",
      "unit and browser tests",
      "sweep lint",
      "contract and bundle tests",
      "competitors check",
      "CLAUDE.md truth test",
      "offline",
      "rename-copy",
    ]);
  });

  // Local first (root CLAUDE.md): pnpm dev with the network blocked, on every
  // full run, since any change can make it need the cloud. Not on a push.
  it("full: runs pnpm dev offline, holding the lock; a push does not", () => {
    const offline = plan("full", [], linux, workers).suites.find((s) => s.name === "offline");
    expect(offline).toMatchObject({
      cmd: "node",
      args: ["tools/local-check/src/cli.ts", "offline"],
      heavy: true,
    });
    expect(
      plan("push", ["@acme/frontend"], linux, workers).suites.map((s) => s.name),
    ).not.toContain("offline");
  });

  // Design §5: the rename on a copy of HEAD, then `pnpm check` there, on
  // every full run and last; never on a push.
  it("full: renames a copy of HEAD and checks it, holding the lock; a push does not", () => {
    const suites = plan("full", [], linux, workers).suites;
    expect(suites.at(-1)).toMatchObject({
      name: "rename-copy",
      cmd: "node",
      args: ["tools/bootstrap/src/rename-copy.ts"],
      heavy: true,
    });
    expect(
      plan("push", ["@acme/frontend"], linux, workers).suites.map((s) => s.name),
    ).not.toContain("rename-copy");
  });

  it("the preview smoke stops only this worktree's preview, and only one it started", () => {
    const smoke = plan("full", ["@acme/preview"], linux, workers).suites.find(
      (s) => s.name === "preview smoke",
    );
    expect(smoke?.cmd).toBe("sh");
    const script = smoke?.args[1] ?? "";
    expect(script).toContain("pnpm preview . --no-open");
    expect(script).toContain("pnpm preview list");
    expect(script).toContain("pnpm preview stop .");
    expect(script).not.toContain("--all");
    expect(script.indexOf('*"Already running"*) exit 0')).toBeLessThan(
      script.indexOf("pnpm preview stop"),
    );
    // One still starting has not answered: not a pass.
    expect(script).toMatch(/\*Already\*\) echo "[^"]+" ; exit 1/);
  });

  it("full: the e2e suite says which build and projects it runs, for the proof (CI15)", () => {
    const p = plan("full", ["@acme/frontend"], linux, workers);
    expect(p.suites.filter((s) => s.e2e !== undefined).map((s) => s.e2e)).toEqual([
      { build: "production", projects: ["chromium", "android", "iphone"] },
    ]);
    const old = plan("full", ["@acme/frontend"], sonoma, workers);
    expect(old.suites.filter((s) => s.e2e !== undefined).map((s) => s.e2e?.projects)).toEqual([
      ["chromium", "android"],
    ]);
  });

  it("full without the frontend affected runs no e2e", () => {
    const p = plan("full", ["@acme/backend"], linux, workers);
    expect(p.suites.some((s) => s.name.startsWith("e2e"))).toBe(false);
  });

  it("leaves the iphone project out on macOS below 15, and says the proof job will refuse it", () => {
    const p = plan("full", ["@acme/frontend"], sonoma, workers);
    expect(p.suites.find((s) => s.name === "e2e, production build")?.args).not.toContain(
      "--project=iphone",
    );
    expect(p.notRun).toEqual([
      "e2e on the iphone project (WebKit needs macOS 15), so the PR's proof job refuses this proof",
    ]);
  });
});

describe("hosts and workers", () => {
  it("runs WebKit on Linux and macOS 15+, not on macOS 14 (frontend/e2e/phones.ts)", () => {
    expect([linux, sonoma, sequoia].map((h) => runsWebKit(h))).toEqual([true, false, true]);
    expect(e2eProjects(sonoma)).toEqual(["chromium", "android"]);
  });

  it("reads the e2e worker cap from the environment, falling back on nonsense", () => {
    expect(workersFrom({})).toEqual({ e2e: 3 });
    expect(workersFrom({ ACME_E2E_WORKERS: "1" })).toEqual({ e2e: 1 });
    expect(workersFrom({ ACME_E2E_WORKERS: "0" })).toEqual({ e2e: 3 });
    expect(workersFrom({ ACME_E2E_WORKERS: "many" })).toEqual({ e2e: 3 });
  });
});
