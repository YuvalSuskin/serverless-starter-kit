import { writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { atLeast, doctor } from "./doctor.ts";
import { scriptedRunner, tempRepo } from "./testing.ts";

describe("atLeast", () => {
  it.each([
    ["24.21.0", "24.21.0", true],
    ["26.8.1", "24.21.0", true],
    ["24.9.0", "24.21.0", false],
    ["2.39.5", "2.40.0", false],
  ])("%s >= %s is %s", (version, floor, expected) => {
    expect(atLeast(version, floor)).toBe(expected);
  });
});

describe("doctor", () => {
  function machine(overrides: Record<string, { code?: number; stdout?: string }>) {
    const repo = tempRepo();
    writeFileSync(path.join(repo.root, ".nvmrc"), "24.21.0\n");
    writeFileSync(path.join(repo.root, "package.json"), '{"packageManager":"pnpm@10.34.5"}');
    const run = scriptedRunner({
      "bd --version": { stdout: "bd version 1.3.0" },
      "docker info --format {{.ServerVersion}}": { stdout: "28.0.0" },
      "gh auth status": {},
      "gh --version": { stdout: "gh version 2.101.0" },
      "git --version": { stdout: "git version 2.50.1" },
      "node --version": { stdout: "v24.21.0" },
      "pnpm --version": { stdout: "10.34.5" },
      "python3 --version": { stdout: "Python 3.13.0" },
      "typescript-language-server --version": { stdout: "4.4.0" },
      ...overrides,
    });
    const out: string[] = [];
    return { deps: { cwd: repo.root, out: (line: string) => out.push(line), run }, out };
  }

  it("passes a ready machine", async () => {
    const { deps, out } = machine({});
    expect(await doctor(deps)).toBe(0);
    expect(out.join("\n")).not.toMatch(/✗/);
  });

  it("accepts Apple's git 2.39: preview needs 2.31 (rev-parse --path-format)", async () => {
    const { deps, out } = machine({
      "git --version": { stdout: "git version 2.39.5 (Apple Git-154)" },
    });
    expect(await doctor(deps)).toBe(0);
    expect(out).toContain("✓ git >= 2.31");
  });

  it("fails on a required tool, and prints how to fix it", async () => {
    const { deps, out } = machine({ "pnpm --version": { stdout: "9.0.0" } });
    expect(await doctor(deps)).toBe(1);
    expect(out.join("\n")).toMatch(/✗ pnpm[\s\S]*corepack/);
  });

  it("only warns about optional tools", async () => {
    const { deps, out } = machine({
      "docker info --format {{.ServerVersion}}": { code: 1 },
      "gh auth status": { code: 1 },
    });
    expect(await doctor(deps)).toBe(0);
    expect(out.join("\n")).toMatch(/^✗ Docker: /m);
    expect(out.join("\n")).toMatch(/^✗ gh, signed in: /m);
  });
});
