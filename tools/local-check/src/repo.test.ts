// What runs here against what GitHub runs, read from the workflow files as
// text (as frontend/tests/ci-workflow.test.ts reads them). Since CI17 GitHub
// runs no check: ci.yml is one job, `proof`, that reads the proof
// `pnpm check:full` posts, so check:full must run every check the repo has.
// .github/ is a turbo global dependency, so any workflow change runs this.
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import { coverageToken, fullMatrix, SCOPE_STEP } from "./e2e-matrix.ts";
import { PROOF_CONTEXT, PROOF_JOB, PROOF_STEP } from "./github.ts";
import { majorOf } from "./node-pin.ts";
import { plan } from "./plan.ts";

const root = path.join(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const ci = read(".github/workflows/ci.yml");
const workflows = readdirSync(path.join(root, ".github/workflows")).filter((f) =>
  /\.ya?ml$/.test(f),
);

const linux = { platform: "linux", release: "6.8.0" };
const everything = ["@acme/frontend", "@acme/backend", "@acme/deploy", "@acme/preview"];
const turboTasks = (args: string[]) =>
  args.join(" ").replace("exec turbo run ", "").split(" --")[0]?.split(" ") ?? [];

it("ci.yml is one job, proof, on every ready pull request, docs-only ones too (CI17)", () => {
  const on = ci.slice(ci.indexOf("\non:\n"), ci.indexOf("\nconcurrency:"));
  expect(on).toBe(
    "\non:\n  pull_request:\n    types: [opened, synchronize, reopened, ready_for_review]\n",
  );
  const jobs = ci.slice(ci.indexOf("\njobs:\n"));
  expect([...jobs.matchAll(/^ {2}([\w-]+):$/gm)].map((m) => m[1])).toEqual([PROOF_JOB]);
  expect(jobs).toContain("\n    if: github.event.pull_request.draft == false\n");
  expect(jobs).not.toMatch(/turbo run|pnpm (test|e2e|check)/);
});

it("no workflow runs on a push or a schedule; deploy-dev is a button on main (CI17)", () => {
  const triggers = workflows.flatMap((file) =>
    [
      ...read(`.github/workflows/${file}`).matchAll(/^ {2}(push|schedule|pull_request_target):/gm),
    ].map((m) => `${file}: ${m[1] ?? ""}`),
  );
  expect(triggers).toEqual([]);
  const dev = read(".github/workflows/deploy-dev.yml");
  expect(dev).toContain("\non:\n  workflow_dispatch:\n\n");
  expect(dev).toContain("    if: github.ref == 'refs/heads/main'\n");
  expect(dev).toContain("uses: ./.github/actions/deploy-stage");
});

it("check:full runs every check of the root `pnpm check`, e2e, and what CI's other jobs ran", () => {
  const { suites } = plan("full", everything, linux, { e2e: 3 });
  const tasks = new Set(
    suites.filter((s) => s.args[0] === "exec").flatMap((s) => turboTasks(s.args)),
  );
  const rootCheck = (JSON.parse(read("package.json")) as { scripts: { check: string } }).scripts
    .check;
  for (const task of rootCheck.replace("turbo run ", "").split(" ")) expect(tasks).toContain(task);
  expect(tasks).toContain("e2e");
  const others = suites.filter((s) => s.args[0] !== "exec").map((s) => s.args.join(" "));
  expect(others).toEqual(
    expect.arrayContaining([
      "sweep lint",
      "competitors check",
      "--filter @acme/frontend run build:opennext",
      expect.stringContaining("pnpm preview . --no-open"),
    ]),
  );
  // The CLAUDE.md truth test it runs exists.
  const truth = suites.find((s) => s.name === "CLAUDE.md truth test")?.args.at(-1) ?? "";
  expect(truth).toMatch(/claude-md\.test\.ts$/);
  expect(existsSync(path.join(root, "backend", truth))).toBe(true);
  expect(read("frontend/package.json")).toContain('"build:opennext": "open-next build"');
});

// turbo runs tasks in strict env mode: a variable a task does not declare
// never reaches it (the e2e ports fell back to 3100 and 8788 without this).
it("every variable a suite sets reaches its turbo task", () => {
  const turboJson = JSON.parse(read("turbo.json")) as {
    globalPassThroughEnv?: string[];
    tasks: Record<string, { env?: string[]; passThroughEnv?: string[] }>;
  };
  const { suites } = plan("full", everything, linux, { e2e: 3 });
  const missing = suites.flatMap((suite) => {
    const tasks = turboTasks(suite.args);
    return Object.keys(suite.env ?? {}).flatMap((key) =>
      tasks
        .filter((task) => {
          const t = turboJson.tasks[task] ?? {};
          return ![
            ...(turboJson.globalPassThroughEnv ?? []),
            ...(t.env ?? []),
            ...(t.passThroughEnv ?? []),
          ].includes(key);
        })
        .map((task) => `${task}: ${key}`),
    );
  });
  expect(missing).toEqual([]);
});

it("the proof job looks for the proof local-check posts, under the names it re-runs by", () => {
  expect(ci).toContain(`\n  ${PROOF_JOB}:\n`);
  expect(ci).toMatch(
    new RegExp(
      `- name: ${PROOF_STEP}\\n\\s+id: proof\\n[\\s\\S]*?run: \\.github/scripts/local-proof\\.sh\\n`,
    ),
  );
  const script = read(".github/scripts/local-proof.sh");
  expect(script).toContain(`select(.context == "${PROOF_CONTEXT}")`);
  // No waiver: the branch rule requires the status itself.
  expect(script).not.toContain("local-check-waived");
});

it("the proof job asks turbo what the change affects, then whether the proof covers it", () => {
  const steps = ci.slice(ci.indexOf(`- name: ${PROOF_STEP}`));
  const affected = steps.slice(steps.indexOf("- name: What the change affects"));
  expect(affected).toMatch(
    /^- name: .+\n\s+id: affected\n\s+run: \|\n\s+set -o pipefail\n\s+export TURBO_SCM_BASE=\$\(git rev-parse HEAD\^1\)\n/,
  );
  expect(affected).toContain("turbo ls --affected");
  expect(affected).toContain('echo "frontend=$(jq \'index("@acme/frontend") != null\'');
  const scope = steps.slice(steps.indexOf(`- name: ${SCOPE_STEP}`));
  expect(scope).toMatch(
    /^- name: .+\n\s+env:\n\s+PROOF_DESCRIPTION: \$\{\{ steps\.proof\.outputs\.description \}\}\n\s+FRONTEND_AFFECTED: \$\{\{ steps\.affected\.outputs\.frontend \}\}\n\s+run: node tools\/local-check\/src\/cli\.ts proof-scope\n/,
  );
  // Not continue-on-error: a step that fails fails the gate.
  expect(ci).not.toContain("continue-on-error");
  // The proof first: no install for a head without one.
  expect(ci.indexOf(`- name: ${PROOF_STEP}`)).toBeLessThan(ci.indexOf("pnpm install"));
});

it("what a full run covers locally is what the proof job requires, project by project (CI15, CI17)", () => {
  const { suites } = plan("full", everything, linux, { e2e: 3 });
  const local =
    suites
      .find((s) => s.e2e?.build === "production")
      ?.e2e?.projects.toSorted((a, b) => a.localeCompare(b)) ?? [];
  const required = fullMatrix()
    .flatMap((e) => e.projects.split(" "))
    .toSorted((a, b) => a.localeCompare(b));
  expect(local).toEqual(required);
  expect(local).toHaveLength(3);
});

it("the proof script hands the description on, and only for a proof it found", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "local-proof-"));
  const output = path.join(dir, "output");
  const fake = path.join(dir, "gh");
  // A gh that answers the status call with what STATUS holds (jq's filter is
  // gh's job: --jq is not applied).
  writeFileSync(
    fake,
    ["#!/usr/bin/env bash", 'case "$2" in', '  *status) printf "%b" "$STATUS" ;;', "esac"].join(
      "\n",
    ),
  );
  chmodSync(fake, 0o755);
  const run = (status: string) => {
    try {
      writeFileSync(output, "");
      execFileSync("bash", [path.join(root, ".github/scripts/local-proof.sh")], {
        env: {
          PATH: `${dir}:${process.env.PATH ?? ""}`,
          REPO: "o/r",
          SHA: "a".repeat(40),
          WAIT_SECONDS: "0",
          GITHUB_OUTPUT: output,
          STATUS: status,
        },
        stdio: "pipe",
      });
      return { ok: true, output: readFileSync(output, "utf8") };
    } catch {
      return { ok: false, output: readFileSync(output, "utf8") };
    }
  };
  const description = `[${coverageToken({ production: ["chromium"] })}] passed in 9m12s`;
  expect(run(`success\t${description}`)).toEqual({
    ok: true,
    output: `description=${description}\n`,
  });
  expect(run("pending\twaiting")).toEqual({ ok: false, output: "" });
  expect(run("\t")).toEqual({ ok: false, output: "" });
});

it("the proof-scope command passes a covering proof and fails anything else (CI17)", () => {
  const cli = path.join(root, "tools/local-check/src/cli.ts");
  const run = (env: Record<string, string | undefined>) => {
    try {
      execFileSync("node", [cli, "proof-scope"], {
        env: { PATH: process.env.PATH ?? "", ...env },
        stdio: "pipe",
      });
      return 0;
    } catch (error) {
      return (error as { status: number }).status;
    }
  };
  const all = ["chromium", "android", "iphone"];
  const pinned = majorOf(read(".nvmrc"));
  const covered = `[${coverageToken({ production: all }, pinned)}] x`;
  const none = `[${coverageToken({ production: [] }, pinned)}] x`;
  expect(run({ PROOF_DESCRIPTION: covered, FRONTEND_AFFECTED: "true" })).toBe(0);
  expect(run({ PROOF_DESCRIPTION: none, FRONTEND_AFFECTED: "false" })).toBe(0);
  for (const env of [
    { PROOF_DESCRIPTION: none, FRONTEND_AFFECTED: "true" },
    { PROOF_DESCRIPTION: covered.replace(/ node\d+/, ""), FRONTEND_AFFECTED: "false" },
    {
      PROOF_DESCRIPTION: `[${coverageToken({ production: all }, (pinned ?? 0) + 2)}] x`,
      FRONTEND_AFFECTED: "true",
    },
    { PROOF_DESCRIPTION: "garbage\n::stop-commands::", FRONTEND_AFFECTED: "false" },
    { FRONTEND_AFFECTED: "false" },
    { PROOF_DESCRIPTION: covered },
    {},
  ]) {
    expect(run(env)).toBe(1);
  }
});

it("the Node pin has one home, .nvmrc, which every setup-node reads (CI16)", () => {
  const files = [
    ...workflows.map((f) => `.github/workflows/${f}`),
    ".github/actions/setup/action.yml",
  ];
  const text = files.map((f) => read(f)).join("\n");
  const setups = text.match(/uses: actions\/setup-node@/g) ?? [];
  expect(setups.length).toBeGreaterThan(0);
  expect(text.match(/node-version-file: \.nvmrc/g)).toHaveLength(setups.length);
  expect(text).not.toContain("node-version:");
  // package.json's engines names the same major.
  const engines = (JSON.parse(read("package.json")) as { engines: { node: string } }).engines.node;
  expect(majorOf(engines.replace(/^[^\d]*/, ""))).toBe(majorOf(read(".nvmrc")));
  expect(majorOf(read(".nvmrc"))).toBeDefined();
});
