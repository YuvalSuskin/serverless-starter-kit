// pnpm sweep verify <batch>: the mechanical half of "fixing properly" (spec
// §8). For every finding the batch settled: each losing quote is gone from
// every place the sweep reads, the winning text is at its home, links resolve,
// and pnpm check is green. Old text kept on purpose is not a failure: the
// ledger, the archive, review records, executed plans, decision and design-spec
// entries marked superseded, and closed decision beads superseded in part.
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Run } from "./exec.ts";

import { readLedger } from "./ledger.ts";
import { brokenLinks } from "./links.ts";
import { containsQuote, normaliseQuote } from "./quote.ts";
import { type FindingLine, isFindingLine, type LedgerLine } from "./schema.ts";
import { liveFiles } from "./scope.ts";

const TEXT_FILE = /\.(md|ts|tsx|mts|js|mjs|cjs|json|ya?ml|css|html|py|txt|toml)$/;
const CODE_SIDES = new Set(["code", "test"]);

// The sweep's own beads quote old text on purpose. (Plain `review` beads are
// ordinary work and are read.)
const RECORD_LABELS = new Set(["sweep", "sweep-queue"]);
// How the repo marks an old decision it keeps (H6): struck through, amended,
// superseded, superseded in part, "(superseded, see Decided)".
const MARKED = /~~|amended by|superseded/i;
// Executed plans say what was planned then (the checker brief's "What is not a
// finding"); the folder's CLAUDE.md is a live how-to and is read.
const PLAN = /^docs\/superpowers\/plans\/(?!CLAUDE\.md$)[^/]+\.md$/;
// Where an entry marked superseded is kept history (H6).
const MARKED_ENTRIES = [/^docs\/decisions\//, /^docs\/superpowers\/specs\/(?!CLAUDE\.md$)[^/]+$/];

/** Every text the sweep reads, by ref, and the beads whose earlier text is kept history. */
interface Texts {
  byRef: Map<string, string>;
  history: Set<string>;
}

interface ExportedIssue {
  _type?: string;
  labels?: string[];
  close_reason?: string;
  dependencies?: { depends_on_id: string; type?: string }[];
  id: string;
  status: string;
  title?: string;
  description?: string;
  design?: string;
  notes?: string;
  acceptance_criteria?: string;
  comments?: { text: string }[];
}

export function verifyBatch(
  root: string,
  batch: number,
  run: Run,
  opts: { skipCheck?: boolean } = {},
): string[] {
  const ledger = readLedger(root);
  // Bug beads the ledger names (code fixes, regressions) describe the old
  // behaviour on purpose.
  const records = new Set(ledger.flatMap(bugBeads));
  const texts = everywhere(root, run, records);
  const problems: string[] = [];
  const settled = ledger.filter(isFindingLine).filter((line) => line.owner.batch === batch);
  const home = (ref: string): string => texts.byRef.get(ref) ?? outsideText(root, run, ref);

  for (const line of settled) problems.push(...findingProblems(line, texts, home));
  for (const { file, target } of brokenLinks(root)) problems.push(`${file}: broken link ${target}`);
  if (opts.skipCheck !== true) {
    try {
      run("pnpm", ["check"], { cwd: root });
    } catch {
      problems.push("pnpm check is red: run it for the details");
    }
  }
  return problems;
}

function bugBeads(line: LedgerLine): string[] {
  if (isFindingLine(line)) return line.resolution.beads;
  return line.bead === undefined ? [] : [line.bead];
}

/** One settled finding: its losing quotes gone everywhere, its winner at home. */
function findingProblems(
  line: FindingLine,
  texts: Texts,
  homeText: (ref: string) => string,
): string[] {
  const id = line.finding.id;
  const problems: string[] = [];
  // A pending code side waits for its bug bead (spec §8): only that file is
  // skipped; the same text anywhere else still fails.
  const pending = line.resolution.codePending
    ? new Set(line.finding.sides.filter((s) => CODE_SIDES.has(s.type)).map((s) => s.ref))
    : new Set<string>();
  for (const losing of line.resolution.endState.losing) {
    for (const [ref, text] of texts.byRef) {
      if (pending.has(ref) || !containsQuote(text, losing.lostQuote)) continue;
      if (kept(ref, text, losing.lostQuote, texts.history)) continue;
      problems.push(`${id}: losing text still in ${ref}: "${losing.lostQuote}"`);
    }
  }
  const home = line.resolution.endState.home;
  if (home !== null && !containsQuote(homeText(home.ref), home.quote)) {
    problems.push(`${id}: winning text missing from ${home.ref}: "${home.quote}"`);
  }
  return problems;
}

/** Old text kept on purpose where it was found (H6). */
function kept(ref: string, text: string, quote: string, history: Set<string>): boolean {
  if (PLAN.test(ref) || history.has(ref)) return true;
  return MARKED_ENTRIES.some((dir) => dir.test(ref)) && onlyInMarkedEntries(text, quote);
}

/**
 * A winner's home the live texts do not hold: a closed bead outside the
 * snapshot, or a file outside the live set (a review record). Empty if gone.
 */
function outsideText(root: string, run: Run, ref: string): string {
  try {
    if (!ref.startsWith("bead:")) return readFileSync(path.join(root, ref), "utf8");
    const id = ref.slice("bead:".length);
    const shown = JSON.parse(run("bd", ["show", id, "--json", "--include-comments"])) as unknown;
    const issue = Array.isArray(shown) ? (shown[0] as ExportedIssue | undefined) : undefined;
    return issue === undefined ? "" : beadText(issue, [issue.close_reason]);
  } catch {
    return "";
  }
}

/**
 * The beads the snapshot holds (open beads, closed decisions), minus beads
 * that are records of the sweep itself and quote old text on purpose.
 */
function readableBeads(exported: string, records: Set<string>): ExportedIssue[] {
  return exported
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as ExportedIssue)
    .filter((issue) => (issue._type ?? "issue") === "issue")
    .filter((issue) => issue.status !== "closed" || (issue.labels ?? []).includes("decision"))
    .filter((issue) => !(issue.labels ?? []).some((label) => RECORD_LABELS.has(label)))
    .filter((issue) => !records.has(issue.id) && !superseded(issue));
}

/** A bead `bd supersede` closed: kept as history, like a marked decision entry (H6). */
function superseded(issue: ExportedIssue): boolean {
  return (
    /supersed/i.test(issue.close_reason ?? "") ||
    (issue.dependencies ?? []).some((dep) => /supersed/i.test(dep.type ?? ""))
  );
}

/**
 * A closed decision bead with a comment marking it superseded in part keeps
 * its earlier comments as history (H6, the bead form of a marked entry).
 */
function markedDecision(issue: ExportedIssue): boolean {
  return (
    issue.status === "closed" &&
    (issue.labels ?? []).includes("decision") &&
    (issue.comments ?? []).some((c) => MARKED.test(c.text))
  );
}

function beadText(issue: ExportedIssue, extra: (string | undefined)[] = []): string {
  const parts = [
    issue.title,
    issue.description,
    issue.design,
    issue.notes,
    issue.acceptance_criteria,
    ...extra,
  ];
  const comments = (issue.comments ?? []).map((c) => c.text);
  return [...parts, ...comments].filter((p) => p !== undefined).join("\n");
}

/** Every text the sweep reads, by ref: live files, open beads and memories as bd holds them now. */
function everywhere(root: string, run: Run, records: Set<string>): Texts {
  const byRef = new Map<string, string>();
  const history = new Set<string>();
  for (const file of liveFiles(root)) {
    if (TEXT_FILE.test(file)) byRef.set(file, readFileSync(path.join(root, file), "utf8"));
  }
  for (const issue of readableBeads(run("bd", ["export"]), records)) {
    byRef.set(`bead:${issue.id}`, beadText(issue));
    if (markedDecision(issue)) history.add(`bead:${issue.id}`);
  }
  const memories = JSON.parse(run("bd", ["memories", "--json"])) as Record<string, unknown>;
  for (const [key, value] of Object.entries(memories)) {
    if (typeof value === "string") byRef.set(`memory:${key}`, value);
  }
  return { byRef, history };
}

/**
 * True when every entry of a decision log or design spec holding the quote
 * is marked as replaced (H6: kept, not rewritten). A table row is its own
 * entry; other text belongs to its section.
 */
function onlyInMarkedEntries(markdown: string, quote: string): boolean {
  const needle = normaliseQuote(quote);
  const holding = entries(markdown).filter((entry) => normaliseQuote(entry).includes(needle));
  return holding.length > 0 && holding.every((entry) => MARKED.test(entry));
}

function entries(markdown: string): string[] {
  return markdown.split(/^(?=#{1,4} )/m).flatMap((section) => {
    const lines = section.split("\n");
    const rows = lines.filter((line) => line.startsWith("|"));
    const prose = lines.filter((line) => !line.startsWith("|")).join("\n");
    return [...rows, prose];
  });
}
