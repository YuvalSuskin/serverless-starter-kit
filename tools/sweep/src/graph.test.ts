import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import type { Run } from "./exec.ts";

import { buildGraph, GRAPHIFY_VERSION, stage, TOKEN_BUDGET, topicsFrom } from "./graph.ts";
import { tempRepo, writeFiles } from "./testing.ts";

const FIXTURE = path.join(import.meta.dirname, "fixtures/graph/graph.json");

function repoAndRun() {
  const root = tempRepo({
    "docs/product/uploads.md": "# Uploads\n",
    "docs/decisions/log.md": "| B4 | x |\n",
    "backend/src/upload.ts": "export const MAX_BYTES = 1;\n",
    "backend/package.json": "{}\n",
    ".claude/settings.json": '{ "hooks": {} }\n',
    ".claude/skills/x/SKILL.md": "# Skill\n",
    "docs/competitors/c/profile.md": "# C\n",
    "docs/archive/old.md": "# Old\n",
    "design/fonts/fonts.css": "x",
  });
  const runDir = mkdtempSync(path.join(tmpdir(), "run-"));
  writeFiles(runDir, {
    "snapshot/index.json": JSON.stringify({ "snapshot/beads/acme-x1.md": "bead:acme-x1" }),
    "snapshot/beads/acme-x1.md": "# acme-x1\n",
  });
  return { root, runDir };
}

it("stages the live docs, code and snapshot, and nothing an agent session would load or bill for", () => {
  const { root, runDir } = repoAndRun();
  const staged = stage(root, runDir);
  expect(Object.keys(staged).sort((a, b) => a.localeCompare(b))).toEqual([
    ".claude/skills/x/SKILL.md",
    "backend/src/upload.ts",
    "docs/decisions/log.md",
    "docs/product/uploads.md",
    "snapshot/beads/acme-x1.md",
  ]);
  expect(staged["snapshot/beads/acme-x1.md"]).toBe("bead:acme-x1");
  expect(staged["docs/product/uploads.md"]).toBe("docs/product/uploads.md");
  const stageDir = path.join(root, ".superpowers/sweep/cache/stage");
  expect(existsSync(path.join(stageDir, ".claude/settings.json"))).toBe(false);
});

it("stages a folder Graphify skips as build output under another name, keeping its real ref", () => {
  const root = tempRepo({ "design/scripts/fonts/build/qa.py": "x = 1\n" });
  const runDir = mkdtempSync(path.join(tmpdir(), "run-"));
  const staged = stage(root, runDir);
  expect(staged).toEqual({
    "design/scripts/fonts/build_/qa.py": "design/scripts/fonts/build/qa.py",
  });
  const stageDir = path.join(root, ".superpowers/sweep/cache/stage");
  expect(readFileSync(path.join(stageDir, "design/scripts/fonts/build_/qa.py"), "utf8")).toBe(
    "x = 1\n",
  );
});

it("removes staged files that left the live set", () => {
  const { root, runDir } = repoAndRun();
  stage(root, runDir);
  const stale = path.join(root, ".superpowers/sweep/cache/stage/docs/product/gone.md");
  writeFileSync(stale, "# Gone\n");
  stage(root, runDir);
  expect(existsSync(stale)).toBe(false);
});

it("stops with the install command, and writes nothing, when Graphify is missing", () => {
  const { root, runDir } = repoAndRun();
  const noGraphify: Run = (cmd) => {
    if (cmd === "graphify") throw new Error("graphify --version failed: not found");
    return "abc123\n";
  };
  expect(() => buildGraph(root, runDir, noGraphify)).toThrow(
    `Graphify is not installed: uv tool install graphifyy==${GRAPHIFY_VERSION}`,
  );
  expect(existsSync(path.join(runDir, "topics.json"))).toBe(false);
});

it("runs extract headless from a neutral folder, then reuses the graph while nothing changed", () => {
  const { root, runDir } = repoAndRun();
  const { run: fake, calls } = fakeGraphify(() => "abc123");
  const first = buildGraph(root, runDir, fake);
  expect(first.cached).toBe(false);
  const extract = calls.find((call) => call.args[0] === "extract");
  expect(extract?.args).toEqual(expect.arrayContaining(["--backend", "claude-cli", "--out"]));
  const budget = extract?.args.indexOf("--token-budget") ?? -1;
  expect(extract?.args[budget + 1]).toBe(String(TOKEN_BUDGET));
  expect(extract?.args).not.toContain("install");
  expect(extract?.cwd?.startsWith(root)).toBe(false);
  expect(existsSync(path.join(runDir, "topics.json"))).toBe(true);

  const before = calls.length;
  expect(buildGraph(root, runDir, fake).cached).toBe(true);
  expect(calls.slice(before).some((call) => call.args[0] === "extract")).toBe(false);
});

/** A fake graphify that writes the fixture graph and a manifest of `done` files. */
function fakeGraphify(head: () => string, done?: (staged: string[]) => string[]) {
  const calls: { args: string[]; cwd?: string; env?: Record<string, string | undefined> }[] = [];
  const run: Run = (cmd, args, opts) => {
    if (cmd === "git") return `${head()}\n`;
    calls.push({ args, cwd: opts?.cwd, env: opts?.env });
    if (args[0] === "extract") {
      const stageDir = args[1] ?? "";
      const out = args[args.indexOf("--out") + 1] ?? "";
      const staged = walkFiles(stageDir);
      const manifest = Object.fromEntries((done ?? ((all) => all))(staged).map((f) => [f, {}]));
      writeFiles(out, {
        "graphify-out/graph.json": readFileSync(FIXTURE, "utf8"),
        "graphify-out/manifest.json": JSON.stringify(manifest),
      });
    }
    return args[0] === "extract"
      ? "[graphify extract] chunk 1/1 done\n[graphify extract] tokens: 42,668 in / 1,548 out, est. cost (~claude-cli): $0.0000\n"
      : `graphify ${GRAPHIFY_VERSION}\n`;
  };
  return { run, calls };
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((entry) =>
    statSync(path.join(dir, entry)).isFile(),
  );
}

it("refuses to cache a partial graph: a staged file missing from Graphify's manifest", () => {
  const { root, runDir } = repoAndRun();
  const partial = fakeGraphify(
    () => "abc",
    (staged) => staged.filter((file) => file !== "docs/product/uploads.md"),
  );
  expect(() => buildGraph(root, runDir, partial.run)).toThrow(
    /left 1 file unfinished.*docs\/product\/uploads\.md/,
  );
  const full = fakeGraphify(() => "abc");
  expect(buildGraph(root, runDir, full.run).cached).toBe(false);
});

it("builds again when HEAD or the snapshot changes", () => {
  const { root, runDir } = repoAndRun();
  let head = "abc";
  const graphify = fakeGraphify(() => head);
  buildGraph(root, runDir, graphify.run);
  head = "def";
  expect(buildGraph(root, runDir, graphify.run).cached).toBe(false);
  expect(buildGraph(root, runDir, graphify.run).cached).toBe(true);
  writeFiles(runDir, { "snapshot/beads/acme-x1.md": "# acme-x1, edited\n" });
  expect(buildGraph(root, runDir, graphify.run).cached).toBe(false);
});

it("runs extract without the calling Claude session's variables, and with Graphify's skill refresh off", () => {
  const { root, runDir } = repoAndRun();
  const graphify = fakeGraphify(() => "abc");
  buildGraph(root, runDir, graphify.run);
  const env = graphify.calls.find((call) => call.args[0] === "extract")?.env ?? {};
  expect(env.GRAPHIFY_NO_AUTO_REFRESH).toBe("1");
  expect(env.GRAPHIFY_CLAUDE_CLI_PARALLEL).toBe("1");
  for (const name of [
    "CLAUDECODE",
    "CLAUDE_PID",
    "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_CODE_MESSAGING_SOCKET",
  ]) {
    expect(name in env && env[name] === undefined).toBe(true);
  }
});

it("maps every node back to a ref, and counts only edges Graphify read, not inferred ones", () => {
  const graph = JSON.parse(readFileSync(FIXTURE, "utf8")) as unknown;
  const staged = {
    "docs/product/uploads.md": "docs/product/uploads.md",
    "docs/decisions/log.md": "docs/decisions/log.md",
    "backend/src/upload.ts": "backend/src/upload.ts",
    "snapshot/beads/acme-x1.md": "bead:acme-x1",
  };
  const topics = topicsFrom(graph, staged);
  const docs = topics.find((topic) => topic.files.includes("docs/product/uploads.md"));
  const code = topics.find((topic) => topic.codePaths.includes("backend/src/upload.ts"));
  expect(docs?.files.sort((a, b) => a.localeCompare(b))).toEqual([
    "bead:acme-x1",
    "docs/decisions/log.md",
    "docs/product/uploads.md",
  ]);
  expect(code?.files).toEqual(["backend/src/upload.ts"]);
  // The only link between the two communities is an INFERRED edge.
  expect(docs?.neighbours).toEqual([]);
  expect(code?.passages).toContainEqual({ ref: "backend/src/upload.ts", lines: [1, 1] });
  const refs = new Set(Object.values(staged));
  for (const topic of topics) {
    for (const ref of [...topic.files, ...topic.codePaths, ...topic.passages.map((p) => p.ref)]) {
      expect(refs.has(ref)).toBe(true);
    }
  }
});

it("drops nodes whose file was not staged, instead of citing a raw path", () => {
  const graph = {
    nodes: [
      { id: "a", community: 0, source_file: "docs/product/uploads.md" },
      { id: "b", community: 0, source_file: "somewhere/else.md" },
    ],
    links: [],
  };
  const topics = topicsFrom(graph, { "docs/product/uploads.md": "docs/product/uploads.md" });
  expect(topics[0]?.files).toEqual(["docs/product/uploads.md"]);
});

it("reports Graphify's token line when it built the graph, and none when it reused it", () => {
  const { root, runDir } = repoAndRun();
  const graphify = fakeGraphify(() => "abc");
  expect(buildGraph(root, runDir, graphify.run).tokens).toBe("42,668 in / 1,548 out");
  expect(buildGraph(root, runDir, graphify.run).tokens).toBeUndefined();
});
