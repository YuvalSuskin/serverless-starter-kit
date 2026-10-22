// `pnpm check:full`'s offline step, and `pnpm offline` by hand: the local-first
// rule's proof (root CLAUDE.md, "Local first"). It starts `pnpm dev` with the
// network blocked for Node (offline-guard.ts), waits for /api/health through
// Next's proxy and records how long that took, runs the skeleton's e2e spec on
// Chromium with every request off localhost aborted (frontend/e2e/test.ts),
// and stops what it started. It fails when `pnpm dev` starts slower than the
// budget, when the spec fails, or when the app tried to reach another machine
// at all, even if it coped.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Launch, Stream } from "./exec.ts";

import { realLaunch, realStream } from "./exec.ts";

/**
 * A cold `pnpm dev` (frontend/.next/dev removed) on the owner's machine, to
 * /api/health through Next's proxy: the median of 7 runs on 2026-10-22, which
 * ran from 2.4 s to 6.1 s while other sessions loaded the machine
 * (docs/decisions/2026-10-21-template-build-decisions.md, TB75).
 */
export const DEV_START_BASELINE_MS = 3552;

/** The most a start may take: 1.5 times the baseline. */
export const DEV_START_BUDGET_MS = DEV_START_BASELINE_MS * 1.5;

const POLL_MS = 100;

/**
 * Calls the tools under `pnpm dev` make about themselves, not the project's
 * resources, which they ignore when refused. The guard still refuses them, so
 * dev is proven without them; the run does not fail for them. Next's dev
 * server asks the npm registry whether it is out of date (for the overlay's
 * staleness badge; no flag turns it off). Each entry is a whole host.
 */
const TOOL_TRAFFIC = ["registry.npmjs.org"];

const isToolTraffic = (line: string) =>
  TOOL_TRAFFIC.some((host) =>
    new RegExp(`^pid \\d+ refused ${host.replaceAll(".", "\\.")}(:\\d+)?$`).test(line),
  );

export interface OfflineOptions {
  /** The worktree's root. */
  root: string;
  launch: Launch;
  /** Runs the e2e spec: resolves to its exit code. */
  stream: Stream;
  /** Whether the URL answers 2xx. */
  health: (url: string) => Promise<boolean>;
  /** Two free ports, so a run never meets another worktree's `pnpm dev` (3000, 8787). */
  ports: () => Promise<{ web: number; api: number }>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
  /** The environment `pnpm dev` inherits (NODE_OPTIONS is added to). */
  env?: Record<string, string | undefined>;
  budgetMs?: number;
  /**
   * Starts allowed to be over the budget before the step fails. The default,
   * 2, is because other sessions share the machine: one slow start is load,
   * two in a row is the code.
   */
  attempts?: number;
  /** How long to wait for health before calling the start failed. */
  healthTimeoutMs?: number;
  /** The e2e spec file, in frontend/e2e/. */
  spec?: string;
}

export interface OfflineResult {
  ok: boolean;
  /** How long the start that was kept took, or undefined if none was in budget. */
  startMs: number | undefined;
  /** Every start's time, in order: the retry runs on the cache the first start warmed. */
  startsMs: number[];
  budgetMs: number;
  attempts: number;
  /** Why it failed, in words. Empty when it passed. */
  problems: string[];
  /** Each connection the guard refused. */
  violations: string[];
}

type Attempt =
  | { kind: "silent"; output: string }
  | { kind: "slow"; elapsedMs: number }
  | { kind: "up"; elapsedMs: number; specCode: number; output: string };

/** Polls until the URL answers; the time that took, or undefined if it never did. */
async function awaitHealth(
  opts: OfflineOptions,
  url: string,
  timeoutMs: number,
): Promise<number | undefined> {
  const began = opts.now();
  for (;;) {
    const answered = await opts.health(url);
    const elapsed = opts.now() - began;
    if (answered) return elapsed;
    if (elapsed > timeoutMs) return undefined;
    await opts.sleep(POLL_MS);
  }
}

/** One start of `pnpm dev`: timed, and if it is within the budget, the spec run against it. */
async function attempt(
  opts: OfflineOptions,
  settings: {
    budgetMs: number;
    healthTimeoutMs: number;
    spec: string;
    guard: string;
    logFile: string;
    number: string;
  },
): Promise<Attempt> {
  const ports = await opts.ports();
  const web = `http://127.0.0.1:${String(ports.web)}`;
  const dev = opts.launch("pnpm", ["dev"], {
    cwd: opts.root,
    env: {
      PORT: String(ports.web),
      DEV_API_PORT: String(ports.api),
      DEV_SITE_URL: web,
      NODE_OPTIONS: `${opts.env?.NODE_OPTIONS ?? ""} --import=${settings.guard}`.trim(),
      ACME_OFFLINE_LOG: settings.logFile,
      // The tool's own phoning home is not the app's resource.
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  try {
    const elapsedMs = await awaitHealth(opts, `${web}/api/health`, settings.healthTimeoutMs);
    if (elapsedMs === undefined) return { kind: "silent", output: dev.output() };
    opts.log(
      `offline: start ${settings.number}: pnpm dev answered in ${String(elapsedMs)} ms (budget ${String(settings.budgetMs)} ms)`,
    );
    if (elapsedMs > settings.budgetMs) return { kind: "slow", elapsedMs };
    const specCode = await opts.stream(
      "pnpm",
      [
        "--filter",
        "@acme/frontend",
        "exec",
        "playwright",
        "test",
        settings.spec,
        "--project=chromium",
        "--workers=2",
        "--retries=0",
        "--forbid-only",
      ],
      { cwd: opts.root, env: { E2E_BASE_URL: web, ACME_OFFLINE: "1" } },
    );
    return { kind: "up", elapsedMs, specCode, output: dev.output() };
  } finally {
    await dev.stop();
  }
}

export async function runOffline(opts: OfflineOptions): Promise<OfflineResult> {
  const budgetMs = opts.budgetMs ?? DEV_START_BUDGET_MS;
  const attempts = opts.attempts ?? 2;
  const healthTimeoutMs = opts.healthTimeoutMs ?? 60_000;
  const spec = opts.spec ?? "skeleton.spec.ts";
  const guard = pathToFileURL(path.join(opts.root, "tools/local-check/src/offline-guard.ts")).href;
  const dir = mkdtempSync(path.join(tmpdir(), "acme-offline-"));
  const logFile = path.join(dir, "offline.log");
  const problems: string[] = [];
  let startMs: number | undefined;
  let tries = 0;
  const startsMs: number[] = [];
  const outcomes: string[] = [];
  try {
    while (startMs === undefined && tries < attempts) {
      tries += 1;
      const one = await attempt(opts, {
        budgetMs,
        healthTimeoutMs,
        spec,
        guard,
        logFile,
        number: `${String(tries)} of ${String(attempts)}`,
      });
      const which = `start ${String(tries)} of ${String(attempts)}`;
      if (one.kind === "silent") {
        outcomes.push(
          `${which}: did not answer /api/health within ${String(Math.round(healthTimeoutMs / 1000))} s. It printed:\n${tail(one.output)}`,
        );
        break;
      }
      if (one.kind === "slow") {
        startsMs.push(one.elapsedMs);
        outcomes.push(
          `${which}: answered in ${String(one.elapsedMs)} ms, over the budget of ${String(budgetMs)} ms`,
        );
        if (tries < attempts) {
          opts.log("offline: over the budget; trying once more (on the cache this start warmed)");
        }
        continue;
      }
      startMs = one.elapsedMs;
      startsMs.push(one.elapsedMs);
      if (one.specCode !== 0) {
        problems.push(`${spec} failed (exit ${String(one.specCode)}) with the network blocked`);
        opts.log(`offline: what pnpm dev printed:\n${tail(one.output)}`);
      }
    }
    if (startMs === undefined && outcomes.length > 0) {
      problems.push(`pnpm dev did not start within the budget:\n  ${outcomes.join("\n  ")}`);
    }
    const all = readLog(logFile);
    const refused = all.filter((line) => !isToolTraffic(line));
    if (all.length > refused.length) {
      opts.log(
        `offline: ignored tool traffic the guard refused: ${String(all.length - refused.length)} call(s)`,
      );
    }
    if (refused.length > 0) {
      problems.push(
        `the app tried to reach another machine (the guard refused it):\n  ${refused.join("\n  ")}`,
      );
    }
    return {
      ok: problems.length === 0,
      startMs,
      startsMs,
      budgetMs,
      attempts: tries,
      problems,
      violations: refused,
    };
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

/** What the guard wrote: a line per refused connection. */
function readLog(file: string): string[] {
  try {
    return readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line !== "");
  } catch {
    return []; // nothing was refused
  }
}

function tail(output: string): string {
  return output.split("\n").slice(-40).join("\n");
}

/** Two ports nothing listens on right now. */
async function freePorts(): Promise<{ web: number; api: number }> {
  const take = () =>
    new Promise<net.Server>((resolve, reject) => {
      const server = net.createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        resolve(server);
      });
    });
  const [web, api] = [await take(), await take()];
  const ports = {
    web: (web.address() as net.AddressInfo).port,
    api: (api.address() as net.AddressInfo).port,
  };
  await Promise.all([web, api].map((s) => new Promise((done) => s.close(done))));
  return ports;
}

/** The step as `pnpm offline` and the plan run it: the real process runners. */
export function realOfflineOptions(root: string): OfflineOptions {
  return {
    root,
    launch: realLaunch,
    stream: realStream,
    health: async (url) => {
      try {
        return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
      } catch {
        return false; // not up yet
      }
    },
    ports: freePorts,
    now: () => Date.now(),
    sleep: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
    log: (line) => {
      process.stdout.write(`${line}\n`);
    },
    env: process.env,
  };
}
