// Pins Turborepo's "transit" wiring. Without it,
// a change in a workspace dependency (packages/contracts, packages/config,
// design) leaves a dependent package's lint/typecheck/knip/test hash unchanged,
// and turbo replays a stale pass from its cache. Reads turbo's own task graph
// (--dry=json), so it checks what turbo will actually run, and changes nothing.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const root = path.join(import.meta.dirname, "../..");
const turbo = path.join(root, "node_modules/.bin/turbo");
const rootManifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
// Every task `pnpm check` runs, and build. `format` reads only its own
// package's files, so a dependency cannot make its result stale.
const checkTasks = (rootManifest.scripts.check ?? "").replace(/^turbo run /, "").split(" ");
const CACHED_CHECKS = [...checkTasks.filter((task) => task !== "format"), "build"];

interface DryTask {
  command: string;
  dependencies: string[];
  inputs: Record<string, string>;
  package: string;
  task: string;
  taskId: string;
}

interface WorkspacePackage {
  name: string;
  path: string;
}

// The dry run lists every input file's hash: past Node's 1 MiB default
// buffer once the repo grew (ENOBUFS), so it gets room to grow.
const runTurbo = (args: string[]): unknown =>
  JSON.parse(
    execFileSync(turbo, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }),
  );

const { globalCacheInputs, tasks } = runTurbo(["run", ...CACHED_CHECKS, "--dry=json"]) as {
  globalCacheInputs: { files: Record<string, string> };
  tasks: DryTask[];
};
const byId = new Map(tasks.map((task) => [task.taskId, task]));
const packages = (runTurbo(["ls", "--output=json"]) as { packages: { items: WorkspacePackage[] } })
  .packages.items;

// The workspace packages a package depends on, from its package.json.
function workspaceDependencies(pkg: WorkspacePackage): string[] {
  const manifest = JSON.parse(readFileSync(path.join(root, pkg.path, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })
    .filter(([, version]) => version.startsWith("workspace:"))
    .map(([name]) => name);
}

it("every cached check, and build, depends on its package's transit node", () => {
  const checks = tasks.filter(
    (task) => CACHED_CHECKS.includes(task.task) && task.command !== "<NONEXISTENT>",
  );
  expect(CACHED_CHECKS).toEqual(expect.arrayContaining(["test:contract", "test:bundle", "build"]));
  const missing = checks
    .filter((check) => !check.dependencies.includes(`${check.package}#transit`))
    .map((check) => check.taskId);

  expect(checks.length).toBeGreaterThan(0);
  expect(missing).toEqual([]);
});

it.each(packages.map((pkg) => [pkg.name, pkg] as const))(
  "%s's transit node depends on each workspace dependency's transit node",
  (name, pkg) => {
    const transit = byId.get(`${name}#transit`);
    const missing = workspaceDependencies(pkg)
      .map((dependency) => `${dependency}#transit`)
      .filter((dependency) => !transit?.dependencies.includes(dependency));

    expect(transit).toBeDefined();
    expect(missing).toEqual([]);
  },
);

// A transit node is only as good as its hash: it must cover the package's
// source, or a change there would not reach the dependents' hashes.
it("a transit node's hash covers its package's source", () => {
  const inputs = Object.keys(byId.get("@acme/contracts#transit")?.inputs ?? {});
  expect(inputs).toContain("src/client.ts");
  expect(inputs).toContain("src/index.ts");
});

// Files outside every package that change what every task does. Without
// them a Node upgrade (.nvmrc) or a CI setup change affects nothing, and
// every cached pass is replayed.
it("hashes the files every task depends on into every task", () => {
  expect(Object.keys(globalCacheInputs.files)).toEqual(
    expect.arrayContaining([
      ".nvmrc",
      "package.json",
      "pnpm-workspace.yaml",
      ".github/actions/setup/action.yml",
      ".github/workflows/ci.yml",
    ]),
  );
});

// backend/CLAUDE.md's test checks that the docs/ paths it names exist, so a
// docs change must invalidate that cached pass.
it("the backend's tests hash docs/", () => {
  const inputs = Object.keys(byId.get("@acme/backend#test")?.inputs ?? {});
  expect(inputs).toContain("../docs/superpowers/specs/2026-09-30-sweep-design.md");
});

// `pnpm check` must never run `next build`: it is slow, and CI's
// frontend-build job owns it. A generic dependency such as
// `"test:bundle": { "dependsOn": ["build"] }` would schedule it silently.
it("pnpm check does not build the frontend", () => {
  const { tasks: scheduled } = runTurbo(["run", ...checkTasks, "--dry=json"]) as {
    tasks: DryTask[];
  };
  expect(checkTasks.length).toBeGreaterThan(3);
  expect(scheduled.map((task) => task.taskId)).not.toContain("@acme/frontend#build");
}, 15000);
