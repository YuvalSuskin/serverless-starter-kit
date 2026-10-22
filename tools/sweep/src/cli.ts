// pnpm sweep <command>: the deterministic steps of the consistency sweep
// (spec docs/superpowers/specs/2026-09-30-sweep-design.md §12).
import { readFileSync } from "node:fs";
import path from "node:path";

import { archivePaths, type Candidate, candidates } from "./archive.ts";
import { realRun } from "./exec.ts";
import { buildGraph } from "./graph.ts";
import { appendLedger, readLedger } from "./ledger.ts";
import { brokenLinks } from "./links.ts";
import { lint } from "./lint.ts";
import { assignAndMatch } from "./match.ts";
import { openBeadsFrom, openSweepFindings, rank } from "./rank.ts";
import { plant, plantSnapshot, score, SEEDS } from "./recall.ts";
import { type Finding, LedgerLine, Side, Topic } from "./schema.ts";
import { snapshot } from "./snapshot.ts";
import { readState, type SweepState, writeState } from "./state.ts";
import { refText } from "./text.ts";
import { timeline } from "./timeline.ts";
import { verifyBatch } from "./verify.ts";

const USAGE = `Usage:
  pnpm sweep lint
  pnpm sweep archive --candidates [--json]
  pnpm sweep archive <path>...
  pnpm sweep ledger add <line.json>
  pnpm sweep match <findings.json> --run <dir>
  pnpm sweep snapshot --run <dir>
  pnpm sweep graph --run <dir>
  pnpm sweep rank --run <dir>
  pnpm sweep timeline --side '<side json>'
  pnpm sweep verify <batch> [--skip-check]
  pnpm sweep recall plant --out <dir>
  pnpm sweep recall snapshot --run <dir>
  pnpm sweep recall score <matched.json>
  pnpm sweep state get
  pnpm sweep state set <state.json>`;

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function readJson(file: string | undefined): unknown {
  if (file === undefined) fail(USAGE, 2);
  return JSON.parse(readFileSync(file, "utf8"));
}

const REPO = path.join(import.meta.dirname, "../../..");

const FRESH: SweepState = {
  commit: "",
  date: "",
  batch: null,
  pr: null,
  verify: null,
  mergedCommit: null,
  graphKey: "",
  nextId: 1,
};

/** The value after a flag, such as `--run <dir>`. */
function flag(args: string[], name: string): string {
  const at = args.indexOf(name);
  const value = at === -1 ? undefined : args[at + 1];
  if (value === undefined) fail(USAGE, 2);
  return value;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function lintCommand(): void {
  const problems = lint(REPO);
  if (problems.length > 0) fail(problems.join("\n"));
}

function ledgerCommand(args: string[]): void {
  if (args[0] !== "add") fail(USAGE, 2);
  const parsed = LedgerLine.safeParse(readJson(args[1]));
  if (!parsed.success) fail(parsed.error.message);
  appendLedger(REPO, parsed.data);
}

function matchCommand(args: string[]): void {
  // Beads and memories are read as the run's snapshot rendered them.
  const runDir = path.resolve(flag(args, "--run"));
  const drafts = readJson(args[0]);
  if (!Array.isArray(drafts)) fail("match expects a JSON array of findings");
  const out = assignAndMatch(drafts, {
    state: readState(realRun) ?? FRESH,
    ledger: readLedger(REPO),
    repoText: refText(REPO, runDir),
    open: openSweepFindings(realRun("bd", ["export"])),
  });
  // The IDs are spent once handed out, whatever the lead does next.
  writeState(realRun, out.state);
  for (const { index, reason } of out.dropped) {
    process.stderr.write(`Dropped finding ${String(index)} (fails the schema): ${reason}\n`);
  }
  print(out.results);
}

function snapshotCommand(args: string[]): void {
  const runDir = flag(args, "--run");
  const counts = snapshot(REPO, path.resolve(runDir), realRun);
  const summary = `${String(counts.beads)} beads and ${String(counts.memories)} memories`;
  process.stdout.write(`Wrote ${summary} to ${runDir}/snapshot\n`);
}

function graphCommand(args: string[]): void {
  const runDir = path.resolve(flag(args, "--run"));
  const built = buildGraph(REPO, runDir, realRun);
  const how = built.cached ? "reused" : "built";
  process.stdout.write(`Graph ${how}: ${built.graphFile}; topics in ${runDir}/topics.json\n`);
  if (built.tokens !== undefined) process.stdout.write(`Graphify tokens: ${built.tokens}\n`);
}

/**
 * Ranks the root causes of `<run>/to-file.json`: the findings the lead routed
 * on to be filed (new, related, candidates judged new, surviving queued ones),
 * in the shape `match` prints.
 */
function rankCommand(args: string[]): void {
  const runDir = path.resolve(flag(args, "--run"));
  const matched = readJson(path.join(runDir, "to-file.json")) as { finding: Finding }[];
  const topics = Topic.array().parse(readJson(path.join(runDir, "topics.json")));
  const byCause = new Map<string, Finding[]>();
  for (const { finding } of matched) {
    byCause.set(finding.rootCause, [...(byCause.get(finding.rootCause) ?? []), finding]);
  }
  const rootCauses = [...byCause].map(([key, findings]) => ({ key, findings }));
  print(rank(rootCauses, topics, openBeadsFrom(realRun("bd", ["export"]))));
}

function timelineCommand(args: string[]): void {
  const side = Side.safeParse(JSON.parse(flag(args, "--side")));
  if (!side.success) fail(side.error.message);
  print(timeline(REPO, side.data, realRun));
}

function candidateLine(c: Candidate): string {
  const why = c.citedBy === undefined ? "" : ` (cited by ${c.citedBy.join(", ")})`;
  const unknown = c.unknownBeads === undefined ? "" : ` [unknown: ${c.unknownBeads.join(", ")}]`;
  return `${c.status.padEnd(9)} ${c.files.join(" + ")}  ${c.beads.join(", ")}${why}${unknown}\n`;
}

function archiveCommand(args: string[]): void {
  if (args[0] === "--candidates") {
    const found = candidates(REPO, realRun);
    if (args.includes("--json")) print(found);
    else for (const c of found) process.stdout.write(candidateLine(c));
    return;
  }
  if (args.length === 0) fail(USAGE, 2);
  for (const move of archivePaths(REPO, args, realRun)) {
    process.stdout.write(`${move.from} -> ${move.to}\n`);
  }
  const broken = brokenLinks(REPO);
  if (broken.length > 0) fail(broken.map((b) => `${b.file}: broken link ${b.target}`).join("\n"));
}

function verifyCommand(args: string[]): void {
  const batch = Number(args[0]);
  if (!Number.isInteger(batch) || batch < 1) fail(USAGE, 2);
  const problems = verifyBatch(REPO, batch, realRun, { skipCheck: args.includes("--skip-check") });
  if (problems.length > 0) fail(problems.join("\n"));
  process.stdout.write(`Batch ${String(batch)} verified\n`);
}

function recallCommand(args: string[]): void {
  if (args[0] === "plant") {
    const repo = plant(REPO, SEEDS, path.resolve(flag(args, "--out")));
    process.stdout.write(
      `Planted ${String(SEEDS.length)} seeds (bead and memory seeds go in a run's snapshot) in ${repo}\n`,
    );
  } else if (args[0] === "snapshot") {
    plantSnapshot(path.resolve(flag(args, "--run")), SEEDS);
  } else if (args[0] === "score") {
    const matched = readJson(args[1]) as { finding: Finding }[];
    print(
      score(
        SEEDS,
        matched.map((entry) => entry.finding),
      ),
    );
  } else {
    fail(USAGE, 2);
  }
}

function stateCommand(args: string[]): void {
  if (args[0] === "get") {
    const state = readState(realRun);
    if (state !== null) print(state);
  } else if (args[0] === "set") {
    writeState(realRun, readJson(args[1]) as SweepState);
  } else {
    fail(USAGE, 2);
  }
}

const COMMANDS: Record<string, (args: string[]) => void> = {
  lint: lintCommand,
  ledger: ledgerCommand,
  match: matchCommand,
  snapshot: snapshotCommand,
  graph: graphCommand,
  rank: rankCommand,
  timeline: timelineCommand,
  archive: archiveCommand,
  verify: verifyCommand,
  recall: recallCommand,
  state: stateCommand,
};

const [name = "", ...rest] = process.argv.slice(2);
const command = COMMANDS[name];
if (command === undefined) fail(USAGE, 2);
try {
  command(rest);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
