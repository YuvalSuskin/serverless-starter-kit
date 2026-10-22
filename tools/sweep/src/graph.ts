import { createHash } from "node:crypto";
// pnpm sweep graph: Graphify over the live set, the snapshot and the code,
// headless, to route checkers to the passages that share a claim (spec §5
// steps 3-4, §13). This file is the only place that calls Graphify (S1).
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Run } from "./exec.ts";
import type { Topic } from "./schema.ts";

import { liveFiles } from "./scope.ts";

/** Pinned by hand: Graphify is outside pnpm, so its release-age rule is applied here. */
export const GRAPHIFY_VERSION = "0.9.72";

/**
 * Input tokens per `claude -p` call. Graphify's default (60,000) packs about
 * 170 snapshot beads into one call, whose answer (one node set per file)
 * cannot finish within its 10-minute timeout, so it times out and bisects
 * for hours. Ten beads (3,600 tokens) took 150 seconds and 21,600 output
 * tokens; 6,000 keeps a call near four minutes.
 */
export const TOKEN_BUDGET = 6000;

const CACHE = ".superpowers/sweep/cache";
// Text Graphify reads: prose for its model, code for its parser. Config and
// data (JSON, YAML, CSS) would only cost model calls.
const STAGED = /\.(md|ts|tsx|mts|js|mjs|py)$/;
// Nothing a Claude session would load as settings or hooks.
const NOT_STAGED = [/^\.claude\/(?!skills\/|agents\/)/];
// Folder names Graphify always skips as build output (`_SKIP_DIRS` in its
// detect.py), with no way to include them. Ours can be source
// (design/scripts/fonts/build/), so such a folder is staged under another
// name; its ref still names the real path.
const SKIPPED_BY_GRAPHIFY = new Set(["build", "dist", "target"]);

function stagedPath(file: string): string {
  const parts = file.split("/");
  return parts
    .map((part, i) => (i < parts.length - 1 && SKIPPED_BY_GRAPHIFY.has(part) ? `${part}_` : part))
    .join("/");
}

/**
 * Copies the live docs and code, and the run's snapshot under `snapshot/`,
 * into the lasting stage, removing files that left. Returns staged path to
 * the ref findings cite.
 */
export function stage(root: string, runDir: string): Record<string, string> {
  const stageDir = path.join(root, CACHE, "stage");
  const staged: Record<string, string> = {};
  for (const file of liveFiles(root)) {
    if (!STAGED.test(file) || NOT_STAGED.some((pattern) => pattern.test(file))) continue;
    staged[stagedPath(file)] = file;
  }
  const indexFile = path.join(runDir, "snapshot/index.json");
  const index = existsSync(indexFile)
    ? (JSON.parse(readFileSync(indexFile, "utf8")) as Record<string, string>)
    : {};
  Object.assign(staged, index);

  for (const old of walk(stageDir)) {
    if (!(old in staged)) rmSync(path.join(stageDir, old));
  }
  for (const [file, ref] of Object.entries(staged)) {
    const from = file.startsWith("snapshot/") ? path.join(runDir, file) : path.join(root, ref);
    const to = path.join(stageDir, file);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  return staged;
}

/**
 * Runs `graphify extract` headless on the stage, from a neutral folder so the
 * `claude -p` calls it makes load no repo CLAUDE.md or hooks, and writes the
 * run's topics.json. Reuses the graph while the commit and snapshot are
 * unchanged; Graphify's own cache makes a changed run incremental.
 */
export function buildGraph(
  root: string,
  runDir: string,
  run: Run,
): { graphFile: string; cached: boolean; tokens?: string } {
  try {
    run("graphify", ["--version"]);
  } catch {
    throw new Error(`Graphify is not installed: uv tool install graphifyy==${GRAPHIFY_VERSION}`);
  }
  const staged = stage(root, runDir);
  const graphDir = path.join(root, CACHE, "graph");
  const graphFile = path.join(graphDir, "graphify-out/graph.json");
  const keyFile = path.join(graphDir, "key");
  const key = cacheKey(root, runDir, run);
  const cached =
    existsSync(graphFile) && existsSync(keyFile) && readFileSync(keyFile, "utf8") === key;
  let tokens: string | undefined;
  if (!cached) {
    const neutral = mkdtempSync(path.join(tmpdir(), "sweep-graphify-"));
    try {
      const output = run(
        "graphify",
        [
          "extract",
          path.join(root, CACHE, "stage"),
          "--backend",
          "claude-cli",
          "--token-budget",
          String(TOKEN_BUDGET),
          "--out",
          graphDir,
        ],
        { cwd: neutral, env: graphifyEnv() },
      );
      // "[graphify extract] tokens: 42,668 in / 1,548 out, est. cost …"
      tokens = /tokens: ([\d,]+ in \/ [\d,]+ out)/.exec(output)?.[1];
    } finally {
      rmSync(neutral, { recursive: true, force: true });
    }
    // Graphify writes a graph even when some chunks failed; only a manifest
    // that holds every staged file is a complete graph worth caching.
    const unfinished = unfinishedFiles(graphDir, Object.keys(staged));
    if (unfinished.length > 0) {
      const n = unfinished.length;
      throw new Error(
        `Graphify left ${String(n)} file${n === 1 ? "" : "s"} unfinished (run again to retry them): ${unfinished.slice(0, 10).join(", ")}`,
      );
    }
    writeFileSync(keyFile, key);
  }
  const topics = topicsFrom(JSON.parse(readFileSync(graphFile, "utf8")) as unknown, staged);
  writeFileSync(path.join(runDir, "topics.json"), `${JSON.stringify(topics, null, 2)}\n`);
  return { graphFile, cached, ...(tokens === undefined ? {} : { tokens }) };
}

/**
 * The environment for `graphify extract`: its `claude -p` calls must not join
 * the calling Claude session, and Graphify must not refresh skills it would
 * install elsewhere. Its claude-cli calls run four at a time (Graphify runs
 * them one by one unless asked); each is its own `--no-session-persistence`
 * process, so they share no session.
 */
function graphifyEnv(): Record<string, string | undefined> {
  const session = Object.keys(process.env).filter(
    (name) =>
      name === "CLAUDECODE" ||
      name === "CLAUDE_PID" ||
      /^CLAUDE_CODE_(SESSION|HOST_SESSION|CHILD_SESSION|MESSAGING)/.test(name),
  );
  return {
    ...Object.fromEntries(
      [
        "CLAUDECODE",
        "CLAUDE_PID",
        "CLAUDE_CODE_SESSION_ID",
        "CLAUDE_CODE_MESSAGING_SOCKET",
        ...session,
      ].map((name) => [name, undefined]),
    ),
    GRAPHIFY_NO_AUTO_REFRESH: "1",
    GRAPHIFY_CLAUDE_CLI_PARALLEL: "1",
    GRAPHIFY_CLAUDE_CLI_MODEL: process.env.GRAPHIFY_CLAUDE_CLI_MODEL ?? "sonnet",
  };
}

function unfinishedFiles(graphDir: string, staged: string[]): string[] {
  const file = path.join(graphDir, "graphify-out/manifest.json");
  const done = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>)
    : {};
  return staged.filter((name) => !(name in done));
}

function cacheKey(root: string, runDir: string, run: Run): string {
  const head = run("git", ["rev-parse", "HEAD"], { cwd: root }).trim();
  const hash = createHash("sha256").update(head);
  const snapshotDir = path.join(runDir, "snapshot");
  for (const file of walk(snapshotDir).sort((a, b) => a.localeCompare(b))) {
    hash.update(file).update(readFileSync(path.join(snapshotDir, file)));
  }
  return hash.digest("hex");
}

interface GraphNode {
  id: string;
  community?: number;
  file_type?: string;
  source_file?: string;
  source_location?: string | null;
}
interface GraphEdge {
  source: string;
  target: string;
  confidence?: string;
}

/**
 * One topic per Graphify community: its files as refs, its located passages,
 * its code, and the communities it links to by edges Graphify read directly
 * (EXTRACTED). Inferred edges are the model's guesses and never count.
 */
export function topicsFrom(graph: unknown, staged: Record<string, string>): Topic[] {
  const { nodes = [], links = [] } = graph as { nodes?: GraphNode[]; links?: GraphEdge[] };
  const community = new Map(nodes.map((node) => [node.id, node.community ?? -1]));
  const groups = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const id = node.community ?? -1;
    groups.set(id, [...(groups.get(id) ?? []), node]);
  }
  const neighbours = new Map<number, Set<number>>();
  for (const edge of links) {
    if (edge.confidence !== "EXTRACTED") continue;
    const a = community.get(edge.source);
    const b = community.get(edge.target);
    if (a === undefined || b === undefined || a === b) continue;
    neighbours.set(a, (neighbours.get(a) ?? new Set()).add(b));
    neighbours.set(b, (neighbours.get(b) ?? new Set()).add(a));
  }
  // A node from a file that was not staged has no ref a finding could cite.
  const refOf = (node: GraphNode) =>
    node.source_file === undefined ? undefined : staged[node.source_file];
  const nameOf = (id: number) => `Community ${String(id)}`;

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, members]): Topic => {
      const refs = unique(members.map(refOf));
      const code = unique(members.filter((n) => n.file_type === "code").map(refOf));
      const passages = members.flatMap((node) => {
        const ref = refOf(node);
        const line = /^L(\d+)/.exec(node.source_location ?? "")?.[1];
        return ref === undefined || line === undefined
          ? []
          : [{ ref, lines: [Number(line), Number(line)] as [number, number] }];
      });
      return {
        name: nameOf(id),
        files: refs,
        passages,
        codePaths: code,
        neighbours: [...(neighbours.get(id) ?? [])].sort((a, b) => a - b).map(nameOf),
      };
    });
}

function unique(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((value) => value !== undefined))];
}

/** Every file under a folder, as paths relative to it. */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((entry) =>
    statSync(path.join(dir, entry)).isFile(),
  );
}
