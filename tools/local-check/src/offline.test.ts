import { appendFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { Launched } from "./exec.ts";

import { DEV_START_BASELINE_MS, DEV_START_BUDGET_MS, runOffline } from "./offline.ts";

// A fake clock: sleeping is the only thing that moves it, so "pnpm dev took
// 7 s" is a script, not a wait. `health` answers once a launch is `readyAfter`
// old; `readyAfter` has one entry per launch.
function rig(opts: {
  readyAfter: (number | "never")[];
  specCode?: number;
  /** Lines the dev process's guard writes to ACME_OFFLINE_LOG while it runs. */
  refused?: string[];
}) {
  let clock = 1_000_000;
  const events: string[] = [];
  const envs: Record<string, string | undefined>[] = [];
  const launchedAt: number[] = [];
  const specs: { args: string[]; env: Record<string, string | undefined> | undefined }[] = [];
  const base = {
    root: "/repo",
    now: () => clock,
    sleep: (ms: number) => {
      clock += ms;
      return Promise.resolve();
    },
    log: (line: string) => events.push(`log: ${line}`),
    ports: () => Promise.resolve({ web: 4100, api: 4200 }),
    launch: (_cmd: string, _args: string[], o: { env?: Record<string, string | undefined> }) => {
      envs.push(o.env ?? {});
      launchedAt.push(clock);
      events.push(`launch ${String(launchedAt.length)}`);
      const n = launchedAt.length;
      const file = o.env?.ACME_OFFLINE_LOG;
      if (file !== undefined) {
        for (const line of opts.refused ?? []) appendFileSync(file, `${line}\n`);
      }
      const launched: Launched = {
        output: () => "dev output",
        stop: () => {
          events.push(`stop ${String(n)}`);
          return Promise.resolve();
        },
      };
      return launched;
    },
    health: (url: string) => {
      const ready = opts.readyAfter[launchedAt.length - 1];
      return Promise.resolve(
        url === "http://127.0.0.1:4100/api/health" &&
          ready !== "never" &&
          clock - (launchedAt.at(-1) ?? 0) >= (ready ?? 0),
      );
    },
    stream: (_cmd: string, args: string[], o: { env?: Record<string, string | undefined> }) => {
      events.push("spec");
      specs.push({ args, env: o.env });
      return Promise.resolve(opts.specCode ?? 0);
    },
  };
  return { base, events, envs, specs };
}

describe("DEV_START_BUDGET_MS", () => {
  it("is 1.5 times the measured baseline (TB entry for Task 11 records the runs)", () => {
    expect(DEV_START_BUDGET_MS).toBe(DEV_START_BASELINE_MS * 1.5);
  });
});

describe("runOffline", () => {
  it("passes when pnpm dev starts within the budget, the spec passes and nothing was refused", async () => {
    const r = rig({ readyAfter: [3000] });
    const result = await runOffline({ ...r.base, budgetMs: 5000 });
    expect(result).toMatchObject({ ok: true, problems: [], violations: [], attempts: 1 });
    expect(result.startMs).toBeGreaterThanOrEqual(3000);
    expect(result.startMs).toBeLessThan(5000);
    // Dev is up while the spec runs, and stopped after.
    expect(r.events.filter((e) => !e.startsWith("log"))).toEqual(["launch 1", "spec", "stop 1"]);
  });

  it("starts pnpm dev on its own ports with the guard preloaded and the log set", async () => {
    const r = rig({ readyAfter: [100] });
    await runOffline({ ...r.base, budgetMs: 5000 });
    const env = r.envs[0];
    expect(env?.PORT).toBe("4100");
    expect(env?.DEV_API_PORT).toBe("4200");
    expect(env?.NODE_OPTIONS).toContain(
      "--import=file:///repo/tools/local-check/src/offline-guard.ts",
    );
    expect(env?.ACME_OFFLINE_LOG).toMatch(/offline\.log$/);
    expect(env?.NEXT_TELEMETRY_DISABLED).toBe("1");
  });

  it("runs skeleton.spec.ts on chromium against the running dev server, with the browser blocked", async () => {
    const r = rig({ readyAfter: [100] });
    await runOffline({ ...r.base, budgetMs: 5000 });
    expect(r.specs[0]?.args).toEqual(
      expect.arrayContaining(["playwright", "test", "skeleton.spec.ts", "--project=chromium"]),
    );
    expect(r.specs[0]?.env).toMatchObject({
      E2E_BASE_URL: "http://127.0.0.1:4100",
      ACME_OFFLINE: "1",
    });
  });

  it("fails when the start passes the budget, and runs no spec", async () => {
    const r = rig({ readyAfter: [7000, 7000] });
    const result = await runOffline({ ...r.base, budgetMs: 5000 });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.problems.join("\n")).toMatch(
      /start 1 of 2: answered in 7\d{3} ms, over the budget of 5000 ms\n\s+start 2 of 2: answered in 7\d{3} ms, over the budget of 5000 ms/,
    );
    expect(r.events.filter((e) => !e.startsWith("log"))).toEqual([
      "launch 1",
      "stop 1",
      "launch 2",
      "stop 2",
    ]);
  });

  it("gives a slow start one more try, since the machine is shared, and passes the faster one", async () => {
    const r = rig({ readyAfter: [7000, 3000] });
    const result = await runOffline({ ...r.base, budgetMs: 5000 });
    expect(result).toMatchObject({ ok: true, attempts: 2 });
    // Both starts' times are reported, the slow one first.
    expect(result.startsMs).toHaveLength(2);
    expect(result.startsMs[0]).toBeGreaterThanOrEqual(7000);
    expect(r.events.filter((e) => /start \d of 2: pnpm dev answered/.test(e))).toHaveLength(2);
    expect(r.events.filter((e) => !e.startsWith("log"))).toEqual([
      "launch 1",
      "stop 1",
      "launch 2",
      "spec",
      "stop 2",
    ]);
  });

  it("reports each start separately: a slow first start and a second that never answers", async () => {
    const r = rig({ readyAfter: [7000, "never"] });
    const result = await runOffline({ ...r.base, budgetMs: 5000, healthTimeoutMs: 20_000 });
    expect(result).toMatchObject({ ok: false, attempts: 2 });
    const text = result.problems.join("\n");
    expect(text).toMatch(/start 1 of 2: answered in 7\d{3} ms, over the budget of 5000 ms/);
    expect(text).toContain("start 2 of 2: did not answer /api/health within 20 s");
    expect(text).not.toMatch(/both|then/);
    expect(r.events.filter((e) => !e.startsWith("log"))).toEqual([
      "launch 1",
      "stop 1",
      "launch 2",
      "stop 2",
    ]);
  });

  it("fails, with what dev printed, when pnpm dev never answers", async () => {
    const r = rig({ readyAfter: ["never"] });
    const result = await runOffline({ ...r.base, budgetMs: 5000, healthTimeoutMs: 20_000 });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.problems.join("\n")).toContain("did not answer /api/health within 20 s");
    expect(result.problems.join("\n")).toContain("dev output");
    expect(r.events).toContain("stop 1");
    expect(r.events).not.toContain("spec");
  });

  it("fails when the spec fails, and still stops pnpm dev", async () => {
    const r = rig({ readyAfter: [100], specCode: 1 });
    const result = await runOffline({ ...r.base, budgetMs: 5000 });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("skeleton.spec.ts failed (exit 1)");
    expect(r.events).toContain("stop 1");
  });

  it("fails when the app tried to reach another machine, even if the spec passed", async () => {
    const r = rig({
      readyAfter: [100],
      refused: ["pid 7 refused fonts.googleapis.com:443"],
    });
    const result = await runOffline({ ...r.base, budgetMs: 5000 });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(["pid 7 refused fonts.googleapis.com:443"]);
    expect(result.problems.join("\n")).toContain("fonts.googleapis.com:443");
  });

  it("does not count the tools' own calls: Next's version check on the npm registry", async () => {
    const r = rig({
      readyAfter: [100],
      refused: ["pid 7 refused registry.npmjs.org", "pid 8 refused registry.npmjs.org:443"],
    });
    const result = await runOffline({ ...r.base, budgetMs: 5000 });
    expect(result).toMatchObject({ ok: true, violations: [] });
    expect(r.events.some((e) => e.includes("tool traffic"))).toBe(true);
  });

  it("counts a look-alike of a tool's host", async () => {
    const r = rig({ readyAfter: [100], refused: ["pid 7 refused registry.npmjs.org.example.com"] });
    expect((await runOffline({ ...r.base, budgetMs: 5000 })).ok).toBe(false);
  });

  it("stops pnpm dev even when the spec run throws", async () => {
    const r = rig({ readyAfter: [100] });
    await expect(
      runOffline({
        ...r.base,
        budgetMs: 5000,
        stream: () => Promise.reject(new Error("playwright is not installed")),
      }),
    ).rejects.toThrow("playwright is not installed");
    expect(r.events).toContain("stop 1");
  });
});
