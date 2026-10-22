// Skeleton: `pnpm sst:diff` and `pnpm sst:deploy` run scripts/sst.ts, which
// checks deploy/accounts.json for the stage being deployed before it builds
// anything or reaches SST (and so AWS); `pnpm smoke` checks it before
// `sst shell`. Each test points the script at its own accounts file
// (ACME_ACCOUNTS_FILE), so none depends on what the shipped file holds.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const deployDir = new URL("..", import.meta.url).pathname;

const EMPTY = {
  domain: null,
  region: null,
  stages: { dev: { account: null }, production: { account: null } },
};
const DEV_ONLY = {
  domain: null,
  region: "eu-west-1",
  stages: { dev: { account: "111111111111" }, production: { account: null } },
};

function run(script: string, args: string[], accounts: object, state: object = { steps: {} }) {
  const dir = mkdtempSync(join(tmpdir(), "accounts-"));
  const file = join(dir, "accounts.json");
  writeFileSync(file, JSON.stringify(accounts));
  const stateFile = join(dir, "state.json");
  writeFileSync(stateFile, JSON.stringify(state));
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: deployDir,
    encoding: "utf8",
    env: { ...process.env, ACME_ACCOUNTS_FILE: file, ACME_BOOTSTRAP_STATE_FILE: stateFile },
  });
  return { lines: result.stderr.trim().split("\n"), status: result.status };
}

describe.each([
  ["scripts/sst.ts", ["diff"]],
  ["scripts/sst.ts", ["deploy"]],
  ["scripts/smoke.ts", []],
])("%s %s", (script, command) => {
  it("exits 1 with a one-line message while accounts.json is empty", () => {
    const { lines, status } = run(script, [...command, "--stage", "dev"], EMPTY);
    expect(status).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("deploy/accounts.json");
    expect(lines[0]).toContain("/bootstrap accounts");
  });

  it("checks the stage asked for: only dev filled, production stops", () => {
    const { lines, status } = run(script, [...command, "--stage", "production"], DEV_ONLY);
    expect(status).toBe(1);
    expect(lines).toEqual([expect.stringContaining('"production"')]);
  });
});

// Accounts set, but the skeleton not yet replaced (bootstrap step 6): a deploy
// stops in a second with one line, before anything is built.
describe("scripts/sst.ts deploy before bootstrap step 6", () => {
  it("exits 1 with a one-line message naming step 6", () => {
    const { lines, status } = run("scripts/sst.ts", ["deploy", "--stage", "dev"], DEV_ONLY, {
      steps: { "1-basics": { status: "done" } },
    });
    expect(status).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("/bootstrap replace-skeleton");
  });
});

describe("package.json", () => {
  it("runs sst:diff and sst:deploy through scripts/sst.ts, which gets --stage", () => {
    const { scripts } = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(scripts["sst:diff"]).toBe("node scripts/sst.ts diff");
    expect(scripts["sst:deploy"]).toBe("node scripts/sst.ts deploy");
  });
});
