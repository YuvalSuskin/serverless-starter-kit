// The deploy roles trust any job on main that holds an OIDC token: only jobs that ask for `id-token: write` get one. These
// tests hold that exactly the two deploy jobs do, and the shape their trust
// relies on. They read the workflow files as text: no YAML parser for a few
// facts per job.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOWS = new URL("../../.github/workflows/", import.meta.url);

interface Job {
  file: string;
  name: string;
  text: string;
}

function workflow(file: string): { header: string; jobs: Job[]; text: string } {
  const text = readFileSync(new URL(file, WORKFLOWS), "utf8");
  const [header = "", body = ""] = text.split(/^jobs:\s*$/m);
  const jobs = body
    .split(/^(?= {2}[\w-]+:\s*$)/m)
    .map((block) => ({ file, name: /^ {2}([\w-]+):/.exec(block)?.[1] ?? "", text: block }))
    .filter((job) => job.name !== "");
  return { header, jobs, text };
}

const files = readdirSync(WORKFLOWS).filter((file) => /\.ya?ml$/.test(file));
// `id-token: write`, quoted or not.
const OIDC = /id-token:\s*["']?write/;

function job(file: string, name: string): Job {
  const found = workflow(file).jobs.find((j) => j.name === name);
  if (!found) throw new Error(`${file} has no job ${name}`);
  return found;
}

describe("who may ask for an OIDC token", () => {
  it("every workflow sets its own permissions, read-only at the top", () => {
    const loose = files.filter((file) => {
      const { header } = workflow(file);
      return !header.includes("\npermissions:\n  contents: read\n") || OIDC.test(header);
    });
    expect(loose).toEqual([]);
  });

  it("no workflow grants everything (write-all includes the token)", () => {
    expect(files.filter((file) => workflow(file).text.includes("write-all"))).toEqual([]);
  });

  it("only dev's deploy job and production's deploy job", () => {
    const holders = files.flatMap((file) =>
      workflow(file)
        .jobs.filter((j) => OIDC.test(j.text))
        .map((j) => `${j.file}#${j.name}`),
    );
    expect(holders.toSorted((a, b) => a.localeCompare(b))).toEqual([
      "deploy-dev.yml#deploy-dev",
      "deploy-production.yml#deploy",
    ]);
  });
});

// CI decisions CI17: dev is deployed from the Mac after merges; this
// workflow is the manual fallback.
describe("deploy-dev", () => {
  const { header } = workflow("deploy-dev.yml");
  const deployDev = job("deploy-dev.yml", "deploy-dev");

  it("has no GitHub environment, so its subject names main, which the dev role trusts", () => {
    expect(deployDev.text).not.toContain("    environment:");
  });

  it("is started by hand only, on main, one at a time, never cancelled", () => {
    expect(header).toContain("\non:\n  workflow_dispatch:\n\n");
    expect(header).toContain("\nconcurrency:\n  group: deploy-dev\n  cancel-in-progress: false\n");
    expect(deployDev.text).toContain("if: github.ref == 'refs/heads/main'");
    expect(deployDev.text).toContain("stage: dev");
  });
});

describe("deploy-production", () => {
  const deploy = job("deploy-production.yml", "deploy");

  it("runs only for the owner, on main, in the production environment", () => {
    expect(deploy.text).toContain("github.ref == 'refs/heads/main'");
    // The owner is the repository's owner, never a name written in the file.
    expect(deploy.text).toContain("github.actor == github.repository_owner");
    expect(deploy.text).toContain("github.triggering_actor == github.repository_owner");
    expect(workflow("deploy-production.yml").text).not.toContain("YuvalSuskin");
    expect(deploy.text).toContain("\n    environment: production\n");
  });

  it("is started by hand only, and plans unless told to apply", () => {
    const { header } = workflow("deploy-production.yml");
    expect(header).toContain("\non:\n  workflow_dispatch:\n");
    expect(header).toContain(
      "      apply:\n        description: Deploy. Leave off for the first run, which only plans for you to read.\n        type: boolean\n        default: false\n",
    );
    expect(deploy.text).toContain("apply: ${{ inputs.apply }}");
  });

  it("CI19: is started with the sha of the commit it releases, named in the run's title", () => {
    const { header } = workflow("deploy-production.yml");
    expect(header).toContain("      sha:\n");
    expect(header).toMatch(/ {6}sha:\n(?: {8}.*\n)* {8}required: true\n/);
    expect(header).toContain(
      "\nrun-name: ${{ inputs.apply && 'Release' || 'Plan' }} ${{ inputs.sha }} to production${{ inputs.first_deploy && ' (first deploy)' || '' }}\n",
    );
  });

  it("CI19: checks the release from main's checkout, then deploys exactly that commit", () => {
    const steps = deploy.text;
    const check = steps.indexOf("run: node tools/local-check/src/cli.ts release-check");
    const release = steps.indexOf("ref: ${{ steps.release.outputs.sha }}");
    const deployStage = steps.indexOf("uses: ./.github/actions/deploy-stage");
    expect(check).toBeGreaterThan(steps.indexOf("fetch-depth: 0"));
    expect(release).toBeGreaterThan(check);
    expect(deployStage).toBeGreaterThan(release);
    expect(steps.slice(0, check)).not.toContain("./.github/actions/");
    expect(steps).toContain("SHA_INPUT: ${{ inputs.sha }}");
    expect(steps).toContain("APPLY: ${{ inputs.apply }}");
    expect(steps).toContain("FIRST_DEPLOY: ${{ inputs.first_deploy }}");
    expect(steps).toContain("RUN_ATTEMPT: ${{ github.run_attempt }}");
    expect(steps).toContain("OWNER: ${{ github.repository_owner }}");
    // What the check reads, and nothing it could write.
    for (const scope of ["statuses: read", "pull-requests: read", "actions: read"]) {
      expect(steps).toContain(`      ${scope}`);
    }
    expect(steps).not.toMatch(/(?:contents|statuses|pull-requests|actions): write/);
  });
});

// deploy/accounts.json is empty until `/bootstrap accounts` fills it. A deploy
// job then has no role to assume, so its first step, after the checkout,
// reads the file; with nothing in it every later step is skipped and the job
// ends green, naming what to run. The role's ARN comes from the file too: no
// account ID is written in a workflow.
const CONFIGURED = "steps.accounts.outputs.configured == 'true'";

function stepsOf(j: Job): string[] {
  return j.text.split(/^ {6}- /m).slice(1);
}

describe.each([
  ["deploy-dev.yml", "deploy-dev", "dev"],
  ["deploy-production.yml", "deploy", "production"],
])("%s skips itself until accounts are set", (file, name, stage) => {
  const all = stepsOf(job(file, name));

  it("reads deploy/accounts.json in the first step after the checkout", () => {
    expect(all[0]).toContain("uses: actions/checkout@");
    expect(all[1]).toContain("id: accounts\n");
    expect(all[1]).toContain("deploy/accounts.json");
    expect(all[1]).toContain(`STAGE: ${stage}\n`);
  });

  it("skips every step after it unless the file holds the stage's account and the region", () => {
    const ungated = all
      .slice(2)
      .filter((step) => !step.includes(`if: ${CONFIGURED}`) && !step.includes(`${CONFIGURED} &&`));
    expect(ungated).toEqual([]);
  });

  it("builds the role ARN and the region from the file, never from a literal", () => {
    const deployStage = all.find((step) => step.includes("uses: ./.github/actions/deploy-stage"));
    expect(deployStage).toContain("role: ${{ steps.accounts.outputs.role }}");
    expect(deployStage).toContain("region: ${{ steps.accounts.outputs.region }}");
    expect(workflow(file).text).not.toMatch(/(?<!\w)\d{12}(?!\w)/);
  });

  // The step's script calls jq, as GitHub's runners have it.
  const hasTools = (() => {
    try {
      execFileSync("/bin/bash", ["-c", "command -v jq"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  const script = /\n {8}run: \|\n((?: {10}.*\n| *\n)+)/.exec(all[1] ?? "")?.[1] ?? "";

  // Runs the step's own script, as a runner would, over a copy of the file
  // (and of the bootstrap's state, when one is given).
  function runStep(accounts: object, state?: object) {
    const dir = mkdtempSync(join(tmpdir(), "accounts-step-"));
    mkdirSync(join(dir, "deploy"));
    writeFileSync(join(dir, "deploy/accounts.json"), JSON.stringify(accounts));
    if (state !== undefined) {
      mkdirSync(join(dir, ".bootstrap"));
      writeFileSync(join(dir, ".bootstrap/state.json"), JSON.stringify(state));
    }
    const output = join(dir, "github-output");
    writeFileSync(output, "");
    const stdout = execFileSync("/bin/bash", ["-eo", "pipefail", "-c", script], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: output, STAGE: stage },
    });
    return { output: readFileSync(output, "utf8"), stdout };
  }

  it.skipIf(!hasTools)(
    "with the file empty, ends the job's work: configured=false and a notice",
    () => {
      const empty = {
        domain: null,
        region: null,
        stages: { dev: { account: null }, production: { account: null } },
      };
      const { output, stdout } = runStep(empty);
      expect(output).toBe("configured=false\n");
      expect(stdout).toContain("/bootstrap accounts");
    },
  );

  it.skipIf(!hasTools)("with the stage's account but no region, still skips", () => {
    const { output } = runStep({
      domain: null,
      region: null,
      stages: { dev: { account: "111111111111" }, production: { account: "222222222222" } },
    });
    expect(output).toBe("configured=false\n");
  });

  it.skipIf(!hasTools)("with the file filled, hands on the role and the region", () => {
    const account = stage === "dev" ? "111111111111" : "222222222222";
    const { output } = runStep({
      domain: "example.test",
      region: "eu-west-1",
      stages: { dev: { account: "111111111111" }, production: { account: "222222222222" } },
    });
    expect(output).toBe(
      `configured=true\nrole=arn:aws:iam::${account}:role/github-deploy-${stage}\nregion=eu-west-1\n`,
    );
  });

  // The skeleton's demo routes are unauthenticated: with accounts set, the job
  // still refuses until bootstrap step 6 has replaced them. No state file
  // means the bootstrap is over (or was never used): the job goes on.
  const FILLED = {
    domain: "example.test",
    region: "eu-west-1",
    stages: { dev: { account: "111111111111" }, production: { account: "222222222222" } },
  };

  it.skipIf(!hasTools)(
    "fails, naming step 6, while the bootstrap has not replaced the skeleton",
    () => {
      let failure: { status?: number; stdout?: string } = {};
      try {
        runStep(FILLED, { steps: { "1-basics": { status: "done" } } });
      } catch (error) {
        failure = error as { status?: number; stdout?: string };
      }
      expect(failure.status).toBe(1);
      expect(failure.stdout).toContain("/bootstrap replace-skeleton");
      expect(failure.stdout).toContain("unauthenticated");
    },
  );

  it.skipIf(!hasTools)("goes on once step 6 is done", () => {
    const { output } = runStep(FILLED, {
      steps: { "6-replace-skeleton": { status: "done", date: "2026-10-22" } },
    });
    expect(output).toMatch(/^configured=true\n/);
  });
});

describe(".github/actions/deploy-stage", () => {
  const action = readFileSync(
    new URL("../../.github/actions/deploy-stage/action.yml", import.meta.url),
    "utf8",
  );

  it("assumes the role in the region it is given, not one written in the action", () => {
    expect(action).toContain("aws-region: ${{ inputs.region }}");
    expect(action).not.toMatch(/aws-region: [a-z]{2}-/);
  });

  it("fetches no ffmpeg build: the skeleton ships none", () => {
    expect(action).not.toContain("ffmpeg");
  });
});
