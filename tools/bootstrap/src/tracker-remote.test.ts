// The rename and the tracker steps with the real bd, on a copy whose
// `.beads/config.yaml` names the template's tracker remote, as the published
// template's does. `bd init` clones a configured `sync.remote`, so unless the
// rename drops it the copy adopts the template's issues and prefix, and the
// anchors are filed as the template's beads. The remote here is a local
// file:// Dolt remote: nothing leaves the machine (git may use no other
// transport, and any HTTP goes to a dead proxy).
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { finishSteps, type RunResult, runSteps } from "./finish.ts";
import { MARKER, renameProject } from "./rename.ts";

/** The template's bead prefix: the placeholder, read off the marker's name. */
const TEMPLATE_PREFIX = MARKER.slice(1, -"-template".length);
const SWEEP = "docs/superpowers/specs/2026-09-30-sweep-design.md";
const RESEARCH = "docs/research/2026-09-25-harness-engineering.md";
const SWEEP_TITLE = "Consistency sweep (inherited design)";

const env: NodeJS.ProcessEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== "BEADS_DIR" && key !== "BEADS_DB"),
  ),
  BD_NON_INTERACTIVE: "1",
  GIT_ALLOW_PROTOCOL: "file",
  GIT_AUTHOR_EMAIL: "tracker-remote@example.invalid",
  GIT_AUTHOR_NAME: "tracker-remote",
  GIT_COMMITTER_EMAIL: "tracker-remote@example.invalid",
  GIT_COMMITTER_NAME: "tracker-remote",
  HTTP_PROXY: "http://127.0.0.1:9",
  HTTPS_PROXY: "http://127.0.0.1:9",
  http_proxy: "http://127.0.0.1:9",
  https_proxy: "http://127.0.0.1:9",
};

const runIn =
  (cwd: string) =>
  (cmd: string, args: string[]): RunResult =>
    spawnSync(cmd, args, { cwd, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });

function must(cwd: string, cmd: string, args: string[]): string {
  const result = runIn(cwd)(cmd, args);
  if (result.status !== 0) {
    throw new Error(`${[cmd, ...args].join(" ")} failed:\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

function write(root: string, files: Record<string, string>): void {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
}

const gitInit = (root: string) => {
  must(root, "git", ["init", "-q", "-b", "main"]);
};
const commitAll = (root: string) => {
  must(root, "git", ["add", "-A"]);
  must(root, "git", ["commit", "-q", "-m", "snapshot"]);
};

let base = "";
let remoteUrl = "";

// The template's tracker: one closed anchor bead of its own, pushed to a local remote.
beforeAll(() => {
  base = mkdtempSync(path.join(tmpdir(), "tracker-remote-test-"));
  const template = path.join(base, "template");
  const remote = path.join(base, "remote");
  mkdirSync(template);
  mkdirSync(remote);
  remoteUrl = `file://${remote}`;
  gitInit(template);
  must(template, "git", ["commit", "-q", "--allow-empty", "-m", "template"]);
  must(template, "bd", [
    "init",
    "--prefix",
    TEMPLATE_PREFIX,
    "--non-interactive",
    "--skip-hooks",
    "--skip-agents",
    "--quiet",
  ]);
  const { id } = JSON.parse(
    must(template, "bd", ["create", SWEEP_TITLE, "--labels", "inherited", "--json"]),
  ) as { id: string };
  must(template, "bd", ["close", id, "--reason", "the template's own"]);
  must(template, "bd", ["dolt", "remote", "add", "origin", remoteUrl]);
  must(template, "bd", ["dolt", "push"]);
}, 120_000);

afterAll(() => {
  if (base !== "") rmSync(base, { force: true, maxRetries: 3, recursive: true });
});

describe("pnpm rename, in a copy whose tracker config names the template's remote", () => {
  it("starts a fresh tracker: the anchors get the slug's prefix, and no remote is left", async () => {
    const root = path.join(base, "copy");
    mkdirSync(root);
    gitInit(root);
    const header = (what: string) =>
      `**Beads:** \`${TEMPLATE_PREFIX}-tf8\` (${what}; this project's anchor for it)`;
    write(root, {
      [MARKER]: "Not yet renamed.\n",
      ".beads/config.yaml": `issue-prefix: ${TEMPLATE_PREFIX}\nsync:\n    remote: "${remoteUrl}"\n`,
      ".beads/seed-memories.json": JSON.stringify([{ key: "seed", text: "A seed memory." }]),
      [RESEARCH]: `# Research\n\n${header("inherited research")}\n\nBody.\n`,
      [SWEEP]: `# Sweep\n\n${header("inherited design")}\n\nBody.\n`,
    });
    commitAll(root);

    await renameProject(root, { display: "Demo", slug: "demo" });
    expect(readFileSync(path.join(root, ".beads/config.yaml"), "utf8")).toBe(
      "issue-prefix: demo\n",
    );

    const run = runIn(root);
    const bdSteps = finishSteps(root, "demo", run).filter((step) => step.bd);
    const { ok, report } = runSteps(bdSteps, () => undefined);
    expect(report).toBe("");
    expect(ok).toBe(true);

    const ids = (
      JSON.parse(must(root, "bd", ["list", "--all", "--json"])) as { id: string; title: string }[]
    ).map((bead) => bead.id);
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(id).toMatch(/^demo-/);
    for (const file of [SWEEP, RESEARCH]) {
      const named = /^\*\*Beads:\*\* `([^`]+)`/m.exec(
        readFileSync(path.join(root, file), "utf8"),
      )?.[1];
      expect(ids).toContain(named);
    }
    expect(must(root, "bd", ["dolt", "remote", "list"])).not.toContain(remoteUrl);
  }, 120_000);
});
