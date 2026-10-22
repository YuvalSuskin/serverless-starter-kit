import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { launchWith, streamWith } from "./exec.ts";

const node = process.execPath;
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const quiet = () => undefined;

describe("streamWith's hang watchdog", () => {
  it("stops a suite that prints nothing for idleMs, with 124", async () => {
    const lines: string[] = [];
    const stream = streamWith({ idleMs: 300, graceMs: 200, log: (l) => lines.push(l) });
    const started = Date.now();
    const code = await stream(node, ["-e", "setInterval(() => {}, 1000)"], { cwd: process.cwd() });
    expect(code).toBe(124);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(lines.join("\n")).toMatch(/printed nothing/);
  });

  it("lets a suite run as long as it keeps printing", async () => {
    const stream = streamWith({ idleMs: 400, graceMs: 200, log: quiet });
    const script =
      "let n = 0; const t = setInterval(() => { console.log(n); if (++n === 8) { clearInterval(t); process.exit(0); } }, 100)";
    expect(await stream(node, ["-e", script], { cwd: process.cwd() })).toBe(0);
  });

  it("kills a suite that ignores SIGTERM once the grace is up", async () => {
    const stream = streamWith({ idleMs: 300, graceMs: 200, log: quiet });
    const script = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)";
    expect(await stream(node, ["-e", script], { cwd: process.cwd() })).toBe(124);
  });

  it("passes the suite's exit code through", async () => {
    const stream = streamWith({ idleMs: 5000, graceMs: 200, log: quiet });
    expect(await stream(node, ["-e", "process.exit(3)"], { cwd: process.cwd() })).toBe(3);
  });
});

describe("launchWith", () => {
  // A parent that starts a child and prints the child's pid, as turbo starts next.
  const parent =
    "const c = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']); console.log('child ' + c.pid); setInterval(() => {}, 1000)";

  it("keeps what the process printed, and stops its whole group", async () => {
    const dev = launchWith({ graceMs: 200 })(node, ["-e", parent], { cwd: process.cwd() });
    let child = 0;
    for (let tries = 0; tries < 100 && child === 0; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      child = Number(/child (\d+)\n/.exec(dev.output())?.[1] ?? 0);
    }
    expect(alive(child)).toBe(true);
    await dev.stop();
    // The orphaned child is reaped by init, which a loaded machine delays.
    for (let tries = 0; tries < 100 && alive(child); tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(alive(child)).toBe(false);
  });

  it("kills what ignores SIGTERM once the grace is up, and may be stopped twice", async () => {
    const script =
      "process.on('SIGTERM', () => {}); console.log('up'); setInterval(() => {}, 1000)";
    const dev = launchWith({ graceMs: 200 })(node, ["-e", script], { cwd: process.cwd() });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const started = Date.now();
    await dev.stop();
    await dev.stop();
    expect(Date.now() - started).toBeLessThan(5000);
    expect(dev.output()).toContain("up");
  });

  it("says when the process could not start at all", async () => {
    const dev = launchWith({ graceMs: 200 })("/nonexistent/command", [], { cwd: process.cwd() });
    await dev.stop();
    expect(dev.output()).toMatch(/ENOENT|could not start/);
  });
});

describe("launchWith, interrupted", () => {
  const gone = async (pids: number[], withinMs: number) => {
    for (let waited = 0; waited < withinMs && pids.some((pid) => alive(pid)); waited += 50) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return pids.filter((pid) => alive(pid));
  };

  // What turbo does with its tasks: the launched process starts a child in a
  // group of its own (detached), which starts one more in a third. Neither is
  // in the launched group, so a group kill alone misses them. `stubborn`
  // ignores SIGTERM.
  const launcher = (stubborn: boolean) => `
    const { spawn } = require('node:child_process');
    const grandchild = "${stubborn ? "process.on('SIGTERM', () => {}); " : ""}setInterval(() => {}, 1000)";
    const middle = "const { spawn } = require('node:child_process'); const g = spawn(process.execPath, ['-e', " + JSON.stringify(grandchild) + "], { detached: true, stdio: 'ignore' }); console.log('grandchild ' + g.pid); setInterval(() => {}, 1000)";
    const m = spawn(process.execPath, ['-e', middle], { detached: true, stdio: ['ignore', 'inherit', 'inherit'] });
    setInterval(() => {}, 1000);
  `;
  const harness = (stubborn: boolean) => `
    import { launchWith } from ${JSON.stringify(pathToFileURL(`${import.meta.dirname}/exec.ts`).href)};
    const dev = launchWith({ graceMs: 400 })(process.execPath, ['-e', ${JSON.stringify(launcher(stubborn))}], { cwd: process.cwd() });
    const timer = setInterval(() => {
      const found = /grandchild (\\d+)\\n/.exec(dev.output());
      if (found) { console.log('grandchild ' + found[1]); clearInterval(timer); }
    }, 50);
    setInterval(() => {}, 1000);
  `;

  for (const stubborn of [false, true]) {
    it(`SIGTERM to the launching process stops the whole tree, even a ${stubborn ? "stubborn " : ""}grandchild in a group of its own`, async () => {
      const run = spawn(process.execPath, ["--input-type=module", "-e", harness(stubborn)], {
        stdio: ["ignore", "pipe", "inherit"],
      });
      let printed = "";
      run.stdout.on("data", (chunk: Buffer) => {
        printed += chunk.toString();
      });
      for (let tries = 0; tries < 200 && !/grandchild \d+\n/.test(printed); tries += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const grandchild = Number(/grandchild (\d+)\n/.exec(printed)?.[1] ?? 0);
      expect(alive(grandchild)).toBe(true);
      const exited = new Promise<number | null>((resolve) => run.on("close", resolve));
      run.kill("SIGTERM");
      expect(await exited).toBe(143);
      expect(await gone([grandchild], 5000)).toEqual([]);
      // Nothing of the launching process is left, either.
      expect(alive(run.pid ?? 0)).toBe(false);
    });
  }
});

describe("being interrupted again, and mid-suite", () => {
  const execUrl = JSON.stringify(pathToFileURL(`${import.meta.dirname}/exec.ts`).href);
  const closed = (run: ReturnType<typeof spawn>) =>
    new Promise<number | null>((resolve) => run.on("close", resolve));
  const printing = async (run: ReturnType<typeof spawn>, pattern: RegExp) => {
    let printed = "";
    run.stdout?.on("data", (chunk: Buffer) => {
      printed += chunk.toString();
    });
    for (let tries = 0; tries < 200 && !pattern.test(printed); tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return pattern.exec(printed)?.[1] ?? "";
  };

  it("a second signal during the graceful stop kills the tree at once and exits", async () => {
    // The launched process starts a detached grandchild that ignores SIGTERM,
    // and the grace is long, so only a second signal can end this quickly.
    const grandchild = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)";
    const launched = `const { spawn } = require('node:child_process'); const g = spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { detached: true, stdio: 'ignore' }); console.log('grandchild ' + g.pid); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)`;
    const script = `
      import { launchWith } from ${execUrl};
      const dev = launchWith({ graceMs: 30000 })(process.execPath, ['-e', ${JSON.stringify(launched)}], { cwd: process.cwd() });
      const timer = setInterval(() => {
        const found = /grandchild (\\d+)\\n/.exec(dev.output());
        if (found) { console.log('grandchild ' + found[1]); clearInterval(timer); }
      }, 50);
      setInterval(() => {}, 1000);
    `;
    const run = spawn(node, ["--input-type=module", "-e", script], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    const pid = Number(await printing(run, /grandchild (\d+)\n/));
    expect(alive(pid)).toBe(true);
    const ended = closed(run);
    run.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(alive(pid)).toBe(true); // still within the grace: the first signal has not killed it
    const began = Date.now();
    run.kill("SIGTERM");
    expect(await ended).toBe(143);
    expect(Date.now() - began).toBeLessThan(5000);
    for (let tries = 0; tries < 100 && alive(pid); tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(alive(pid)).toBe(false);
  });

  it("an interrupt during a streamed suite lets the suite stop before local-check exits", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "exec-interrupt-"));
    const marker = path.join(dir, "stopped");
    // The suite takes 600 ms to wind down after SIGTERM, then leaves a marker.
    const suite = `process.on('SIGTERM', () => setTimeout(() => { require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x'); process.exit(0); }, 600)); console.log('suite up'); setInterval(() => {}, 1000)`;
    const script = `
      import { streamWith } from ${execUrl};
      await streamWith({ idleMs: 60000, graceMs: 5000, log: () => {} })(process.execPath, ['-e', ${JSON.stringify(suite)}], { cwd: process.cwd() });
    `;
    try {
      const run = spawn(node, ["--input-type=module", "-e", script], {
        stdio: ["ignore", "pipe", "inherit"],
      });
      await printing(run, /(suite up)/);
      const ended = closed(run);
      run.kill("SIGTERM");
      expect(await ended).toBe(143);
      expect(existsSync(marker)).toBe(true);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
