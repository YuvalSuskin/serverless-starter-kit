// The rename and the tracker steps with the real bd. `bd init` clones a
// tracker it finds: a `sync.remote` in `.beads/config.yaml` (the published
// template's names its own), or `refs/dolt/data` on git's origin (a mirror or
// a renamed fork of the template). Either way the copy would adopt the
// template's issues and prefix, and the anchors would be filed as the
// template's beads. The template's tracker here lives in a local bare git
// repository: nothing leaves the machine (git may use no transport but
// file, and any HTTP goes to a dead proxy). bd is a prerequisite of the
// rename, so without it this file fails rather than skips (TB141).
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
/** A bare git repository holding the template's code and its tracker (refs/dolt/data). */
let remoteUrl = "";

// The template's tracker: one closed anchor bead of its own, pushed to the template's repository.
beforeAll(() => {
  if (spawnSync("bd", ["--version"], { env }).status !== 0) {
    throw new Error(
      "tracker-remote.test.ts needs bd on PATH (https://github.com/gastownhall/beads), as pnpm rename does",
    );
  }
  base = mkdtempSync(path.join(tmpdir(), "tracker-remote-test-"));
  const template = path.join(base, "template");
  remoteUrl = path.join(base, "template.git");
  mkdirSync(template);
  must(base, "git", ["init", "-q", "--bare", remoteUrl]);
  gitInit(template);
  must(template, "git", ["commit", "-q", "--allow-empty", "-m", "template"]);
  must(template, "git", ["remote", "add", "origin", remoteUrl]);
  must(template, "git", ["push", "-q", "origin", "main"]);
  // bd init sets git's origin as the tracker's remote; bd dolt push fills refs/dolt/data.
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
  must(template, "bd", ["dolt", "push"]);
  if (!must(base, "git", ["ls-remote", remoteUrl, "refs/dolt/data"]).includes("refs/dolt/data")) {
    throw new Error("bd dolt push left no refs/dolt/data in the template's repository");
  }
}, 120_000);

afterAll(() => {
  if (base !== "") rmSync(base, { force: true, maxRetries: 3, recursive: true });
});

/** A committed copy of the template, its tracker config naming `remote` if given, and git's `origin`. */
function copy(name: string, opts: { origin?: string; remote?: string }): string {
  const root = path.join(base, name);
  mkdirSync(root);
  gitInit(root);
  const header = (what: string) =>
    `**Beads:** \`${TEMPLATE_PREFIX}-tf8\` (${what}; this project's anchor for it)`;
  const sync = opts.remote === undefined ? "" : `sync:\n    remote: "${opts.remote}"\n`;
  write(root, {
    [MARKER]: "Not yet renamed.\n",
    ".beads/config.yaml": `issue-prefix: ${TEMPLATE_PREFIX}\n${sync}`,
    ".beads/seed-memories.json": JSON.stringify([{ key: "seed", text: "A seed memory." }]),
    [RESEARCH]: `# Research\n\n${header("inherited research")}\n\nBody.\n`,
    [SWEEP]: `# Sweep\n\n${header("inherited design")}\n\nBody.\n`,
  });
  commitAll(root);
  if (opts.origin !== undefined) must(root, "git", ["remote", "add", "origin", opts.origin]);
  return root;
}

/** The tracker steps of `pnpm rename` (all but the install), with the real bd. */
function trackerSteps(root: string) {
  const logs: string[] = [];
  const steps = finishSteps(root, "demo", runIn(root)).filter((step) => step.bd);
  return { ...runSteps(steps, (line) => logs.push(line)), logs };
}

const ids = (root: string) =>
  (JSON.parse(must(root, "bd", ["list", "--all", "--json"])) as { id: string }[]).map(
    (bead) => bead.id,
  );

describe("pnpm rename, in a copy whose tracker config names the template's remote", () => {
  it("starts a fresh tracker: the anchors get the slug's prefix, and no remote is left", async () => {
    const root = copy("copy", { remote: remoteUrl });
    await renameProject(root, { display: "Demo", slug: "demo" });
    expect(readFileSync(path.join(root, ".beads/config.yaml"), "utf8")).toBe(
      "issue-prefix: demo\n",
    );

    const { ok, report } = trackerSteps(root);
    expect(report).toBe("");
    expect(ok).toBe(true);

    const filed = ids(root);
    expect(filed).toHaveLength(2);
    for (const id of filed) expect(id).toMatch(/^demo-/);
    for (const file of [SWEEP, RESEARCH]) {
      const named = /^\*\*Beads:\*\* `([^`]+)`/m.exec(
        readFileSync(path.join(root, file), "utf8"),
      )?.[1];
      expect(filed).toContain(named);
    }
    expect(must(root, "bd", ["dolt", "remote", "list"])).not.toContain(remoteUrl);
  }, 120_000);
});

describe("pnpm rename, in a copy whose git origin carries the template's tracker", () => {
  // A mirror or a renamed fork: no name to recognise, so only the tracker bd made tells.
  it("stops before the anchors, naming the remote bd adopted", async () => {
    const mirror = path.join(base, "mirror.git");
    must(base, "git", ["clone", "-q", "--mirror", remoteUrl, mirror]);
    const root = copy("from-mirror", { origin: mirror });
    await renameProject(root, { display: "Demo", slug: "demo" });

    const { ok, report } = trackerSteps(root);
    expect(ok).toBe(false);
    const [first = ""] = report.split("\n");
    expect(first).toMatch(/^pnpm rename: bd init failed: bd init adopted another tracker/);
    expect(first).toContain(mirror);
    // No anchor was filed into the adopted tracker.
    expect(ids(root).every((id) => id.startsWith(`${TEMPLATE_PREFIX}-`))).toBe(true);
    expect(readFileSync(path.join(root, SWEEP), "utf8")).toContain("**Beads:** `demo-tf8`");
  }, 120_000);
});

describe("pnpm rename, in a copy whose git origin is the project's own, empty repository", () => {
  // GitHub's "Use this template": bd init sets the origin as the tracker's remote, and pushes nothing.
  it("starts a fresh tracker and says which remote bd set", async () => {
    const own = path.join(base, "own.git");
    must(base, "git", ["init", "-q", "--bare", own]);
    const root = copy("own", { origin: own });
    await renameProject(root, { display: "Demo", slug: "demo" });

    const { logs, ok, report } = trackerSteps(root);
    expect(report).toBe("");
    expect(ok).toBe(true);
    expect(logs[0]).toContain(`bd set git's origin as its remote (${own})`);
    for (const id of ids(root)) expect(id).toMatch(/^demo-/);
    expect(must(base, "git", ["ls-remote", own])).toBe("");
  }, 120_000);
});
