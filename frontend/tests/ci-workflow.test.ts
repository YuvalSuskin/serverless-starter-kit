// Pins that the frontend's e2e projects are the ones `pnpm check:full` runs
// and its proof names (CI decisions CI15, CI17): GitHub runs no e2e, so a
// project check:full did not run would be checked nowhere. It lives beside
// turbo-graph.test.ts: the repo root has no test runner.
import { readFileSync } from "node:fs";
import path from "node:path";
import { devices } from "playwright";
import { expect, it } from "vitest";

import { PHONES } from "../e2e/phones";

const root = path.join(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const workflow = read(".github/workflows/ci.yml");

// GitHub refuses a workflow that names a job twice, and runs none of it; YAML
// parsers keep the last one quietly, so tests would read the wrong one.
it("names each ci.yml job once", () => {
  const jobs = workflow.slice(workflow.indexOf("\njobs:\n"));
  const names = [...jobs.matchAll(/^ {2}([\w-]+):$/gm)].map((match) => match[1]);
  expect(names.length).toBeGreaterThan(0);
  expect(new Set(names).size).toBe(names.length);
});

// Every e2e project is one check:full runs on this
// machine, and the engine the proof's reading gives it is its own: WebKit
// for the iPhone, Chromium for the rest. Read as text: tools/local-check is
// Node-only TypeScript outside this package.
it("check:full runs every e2e project, each on its engine", () => {
  const engines = new Map<string, string>([
    ["chromium", "chromium"],
    ...Object.entries(PHONES).map(([name, phone]): [string, string] => [
      name,
      devices[phone].defaultBrowserType,
    ]),
  ]);
  const plan = read("tools/local-check/src/plan.ts");
  const ran = /\? \[([^\]]+)\] : \[/.exec(plan)?.[1] ?? "";
  expect(new Set(ran.split(",").map((p) => p.trim().replace(/"/g, "")))).toEqual(
    new Set(engines.keys()),
  );
  const matrix = read("tools/local-check/src/e2e-matrix.ts");
  const block = /const ENGINES: Record<string, string> = \{([^}]*)\}/.exec(matrix)?.[1] ?? "";
  const declared = new Map(
    block
      .split("\n")
      .map((line) => line.trim().replace(/[",]/g, "").split(": "))
      .filter((pair) => pair.length === 2)
      .map(([name = "", engine = ""]): [string, string] => [name, engine]),
  );
  expect(declared).toEqual(engines);
});

it("the setup action installs and caches exactly the browsers it is given", () => {
  const action = read(".github/actions/setup/action.yml");
  expect(action).toMatch(/\ninputs:\n\s+browsers:/);
  expect(action).toMatch(/key: playwright-.*\$\{\{ inputs\.browsers \}\}/);
  expect([
    ...action.matchAll(/playwright install(-deps| --with-deps) \$\{\{ inputs\.browsers \}\}/g),
  ]).toHaveLength(2);
});

// `pnpm install` wires git to the hooks folder whose pre-push hook runs
// `pnpm check:push` (CI decisions CI1, CI2). What check:push and check:full
// run is pinned in tools/local-check/src/repo.test.ts. (The hook itself is
// not read here: it is the main checkout's copy, tools/local-check/CLAUDE.md.)
it("pnpm install wires the hooks, and the local checks are tools/local-check's", () => {
  const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
  expect(scripts.prepare).toContain("git config core.hooksPath .beads/hooks");
  expect(scripts["check:push"]).toBe("node tools/local-check/src/cli.ts push");
  expect(scripts["check:full"]).toBe("node tools/local-check/src/cli.ts full");
});
