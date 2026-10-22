import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Clock, Signals } from "./processes.ts";

import {
  canBind,
  isListening,
  isPortFree,
  launchDetached,
  realSignals,
  stopGroups,
  tail,
  waitForHealth,
} from "./processes.ts";

function fakeSignals(dieOnTerm: Set<number>) {
  const alive = new Set([1, 2, 3]);
  const sent: string[] = [];
  const signals: Signals = {
    isAlive: (pid) => alive.has(pid),
    kill: (pid, signal) => {
      sent.push(`${String(pid)}:${signal}`);
      if (signal === "SIGKILL" || dieOnTerm.has(pid)) alive.delete(pid);
    },
    sleep: () => Promise.resolve(),
  };
  return { alive, sent, signals };
}

describe("stopGroups", () => {
  it("sends SIGTERM, and SIGKILL only to what survives the grace period", async () => {
    const { alive, sent, signals } = fakeSignals(new Set([1, 2]));
    await stopGroups([1, 2, 3], signals, 300);
    expect(sent).toEqual(["1:SIGTERM", "2:SIGTERM", "3:SIGTERM", "3:SIGKILL"]);
    expect(alive.size).toBe(0);
  });
});

describe("realSignals", () => {
  it("SIGKILLs a group whose leader exited but whose child ignores SIGTERM", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "preview-group-"));
    // The leader (sh) exits at once; its child sleeps with SIGTERM ignored.
    const pid = launchDetached({
      args: ["-c", "trap '' TERM; sleep 30 & exit 0"],
      command: "/bin/sh",
      cwd: dir,
      env: {},
      log: path.join(dir, "group.log"),
    });
    const groupAlive = () => {
      try {
        process.kill(-pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    const leaderAlive = () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    await expect.poll(leaderAlive, { timeout: 5000 }).toBe(false);
    expect(groupAlive()).toBe(true);
    await stopGroups([pid], realSignals, 300);
    await expect.poll(groupAlive, { timeout: 2000 }).toBe(false);
  });
});

describe("waitForHealth", () => {
  const clock = (): Clock => {
    let now = 0;
    return {
      now: () => now,
      sleep: (ms) => {
        now += ms;
        return Promise.resolve();
      },
    };
  };

  it("keeps asking until the server answers 200", async () => {
    let calls = 0;
    const fetchFn = (() => {
      calls += 1;
      if (calls < 3) return Promise.reject(new Error("ECONNREFUSED"));
      return Promise.resolve(new Response("ok"));
    }) as typeof fetch;
    expect(await waitForHealth("http://127.0.0.1:1/api/health", fetchFn, clock())).toBe(true);
    expect(calls).toBe(3);
  });

  it("gives up after the timeout", async () => {
    const fetchFn = (() => Promise.resolve(new Response("no", { status: 503 }))) as typeof fetch;
    expect(await waitForHealth("http://127.0.0.1:2/api/health", fetchFn, clock(), 2000)).toBe(
      false,
    );
  });
});

describe("ports", () => {
  it("sees a listening port as busy, and a closed one as free", async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as net.AddressInfo;
    expect(await isListening(port)).toBe(true);
    expect(await canBind(port)).toBe(false);
    expect(await isPortFree(port)).toBe(false);
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
    expect(await isPortFree(port)).toBe(true);
  });
});

describe("launchDetached", () => {
  it("starts a detached process that writes to its log", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "preview-launch-"));
    const log = path.join(dir, "out.log");
    const pid = launchDetached({
      args: ["-e", "console.log(process.env.PREVIEW_PROBE)"],
      command: process.execPath,
      cwd: dir,
      env: { PREVIEW_PROBE: "hello" },
      log,
    });
    expect(pid).toBeGreaterThan(0);
    await expect.poll(() => readFileSync(log, "utf8"), { timeout: 5000 }).toContain("hello");
  });
});

describe("launchDetached's default env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function probe(defaultEnv: Record<string, string>): Promise<string> {
    const dir = mkdtempSync(path.join(tmpdir(), "preview-default-"));
    const log = path.join(dir, "out.log");
    launchDetached({
      args: ["-e", "console.log(`probe=${process.env.PREVIEW_DEFAULT_PROBE}`)"],
      command: process.execPath,
      cwd: dir,
      defaultEnv,
      env: {},
      log,
    });
    await expect.poll(() => readFileSync(log, "utf8"), { timeout: 5000 }).toContain("probe=");
    return readFileSync(log, "utf8").trim();
  }

  it("applies a default the caller's environment does not set", async () => {
    vi.stubEnv("PREVIEW_DEFAULT_PROBE", undefined);
    expect(await probe({ PREVIEW_DEFAULT_PROBE: "show" })).toBe("probe=show");
  });

  it("keeps the caller's value over the default", async () => {
    vi.stubEnv("PREVIEW_DEFAULT_PROBE", "off");
    expect(await probe({ PREVIEW_DEFAULT_PROBE: "show" })).toBe("probe=off");
  });
});

describe("tail", () => {
  it("returns the last lines, or says there is no log", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "preview-tail-"));
    const log = path.join(dir, "x.log");
    writeFileSync(log, "1\n2\n3\n");
    expect(tail(log, 2)).toBe("2\n3");
    expect(tail(path.join(dir, "missing.log"))).toBe("(no log)");
  });
});
