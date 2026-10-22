// The ledger (spec §8, §9): every settled contradiction, append-only in git,
// and how a new finding is matched against it, so a settled item is never
// asked again and two different findings are never merged.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { containsQuote, normaliseQuote } from "./quote.ts";
import { type Finding, type FindingLine, isFindingLine, LedgerLine } from "./schema.ts";

const LEDGER = "docs/sweeps/ledger.jsonl";

export function readLedger(root: string): LedgerLine[] {
  const file = path.join(root, LEDGER);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      const parsed = LedgerLine.safeParse(JSON.parse(line));
      if (!parsed.success) {
        throw new Error(`${LEDGER}:${String(index + 1)}: ${parsed.error.message}`);
      }
      return parsed.data;
    });
}

/**
 * Appends one checked line. A line that fails the schema, reuses a finding ID,
 * or records an event for an ID the ledger never held throws and writes
 * nothing: events are keyed by ID, so a reused ID would close the wrong item.
 */
export function appendLedger(root: string, line: LedgerLine): void {
  const parsed = LedgerLine.parse(line);
  const held = new Set(
    readLedger(root)
      .filter(isFindingLine)
      .map((l) => l.finding.id),
  );
  if (isFindingLine(parsed) && held.has(parsed.finding.id)) {
    throw new Error(`${parsed.finding.id} is already in the ledger`);
  }
  if (!isFindingLine(parsed) && !held.has(parsed.id)) {
    throw new Error(`${parsed.id} is not in the ledger`);
  }
  const file = path.join(root, LEDGER);
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(parsed)}\n`);
}

function byCodeUnit(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * A ref as it stood before any archive move: normalised, with
 * `docs/archive/<x>` mapped back to `docs/<x>` (the archive keeps each file's
 * path under it, spec §10) and `moves` for any exception.
 */
function originalRef(ref: string, moves: Record<string, string> = {}): string {
  if (/^(bead|memory):/.test(ref)) return ref;
  const clean = path.posix.normalize(ref).replace(/^\.\//, "");
  return (moves[clean] ?? clean).replace(/^docs\/archive\//, "docs/");
}

/**
 * What a finding is about, independent of wording, topic and line numbers:
 * its stable IDs, and its sides' refs (with the bead field, where there is
 * one) as they stood before any archive move.
 */
export function anchors(
  finding: Pick<Finding, "sides">,
  moves: Record<string, string> = {},
): string[] {
  const set = new Set<string>();
  for (const side of finding.sides) {
    // "Acceptance criteria" and "acceptance_criteria" are one field.
    const field =
      side.field === undefined
        ? ""
        : `#${side.field
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_")}`;
    set.add(`ref:${originalRef(side.ref, moves)}${field}`);
    if (side.stableId !== undefined) set.add(`id:${side.stableId}`);
  }
  return [...set].sort(byCodeUnit);
}

export function fingerprint(anchorSet: string[]): string {
  return createHash("sha256").update(anchorSet.join("\n")).digest("hex").slice(0, 16);
}

// "filed": an open sweep bead, or an earlier finding of this run, already
// holds it (set by match.ts, never by matchFinding).
type MatchKind =
  "regression" | "pending" | "suppressed" | "candidate" | "related" | "new" | "filed";
export interface Match {
  kind: MatchKind;
  settled?: string;
  bead?: string;
}

type RepoText = (ref: string) => string;

/**
 * Fingerprints are recomputed here from each line's anchors, never read from
 * the ledger, so a change to `anchors` cannot orphan settled items.
 */
export function matchFinding(
  finding: Finding,
  ledger: LedgerLine[],
  repoText: RepoText,
  moves: Record<string, string> = {},
): Match {
  const settled = ledger.filter(isFindingLine);
  const mine = anchors(finding, moves);
  const print = fingerprint(mine);
  const text = (ref: string) => repoText(originalRef(ref, moves));

  const samePlaces = settled.filter((line) => fingerprint(anchors(line.finding, moves)) === print);
  const same = samePlaces.filter((line) => quotesOverlap(finding, line.finding)).at(-1);
  if (same !== undefined) return matchSettled(same, ledger, text);
  const firstOfPlaces = samePlaces.at(-1);
  if (firstOfPlaces !== undefined) return { kind: "candidate", settled: firstOfPlaces.finding.id };

  const candidate = bestOverlap(mine, settled, moves);
  if (candidate !== undefined) return { kind: "candidate", settled: candidate.finding.id };

  const sameTopic = settled.filter((line) => line.finding.topic === finding.topic).at(-1);
  return sameTopic === undefined
    ? { kind: "new" }
    : { kind: "related", settled: sameTopic.finding.id };
}

function matchSettled(
  line: FindingLine,
  ledger: LedgerLine[],
  text: (ref: string) => string,
): Match {
  const settled = line.finding.id;
  if (line.owner.answer === "not-a-contradiction") {
    const unchanged = line.finding.sides.every((side) => containsQuote(text(side.ref), side.quote));
    return unchanged ? { kind: "suppressed", settled } : { kind: "new" };
  }
  const events = ledger.flatMap((l) => (!isFindingLine(l) && l.id === settled ? [l.event] : []));
  const lastClosed = events.lastIndexOf("closed");
  // A regression already filed stays with its bug until that bug closes.
  if (events.lastIndexOf("regression") > lastClosed) return { kind: "pending", settled };
  if (line.resolution.codePending && lastClosed === -1) return { kind: "pending", settled };
  const back = line.resolution.endState.losing.some((losing) =>
    containsQuote(text(losing.ref), losing.lostQuote),
  );
  // Same places and quotes, losing text gone: the lead judges whether this is
  // the settled item seen again or something new about the same text.
  return { kind: back ? "regression" : "candidate", settled };
}

/** Two findings about the same places are the same item only if they quote the same text. */
export function quotesOverlap(a: Pick<Finding, "sides">, b: Pick<Finding, "sides">): boolean {
  const theirs = b.sides.map((side) => normaliseQuote(side.quote));
  return a.sides.some((side) => {
    const quote = normaliseQuote(side.quote);
    return theirs.some((other) => quote.includes(other) || other.includes(quote));
  });
}

/**
 * The settled line sharing the most with this finding: a shared stable ID
 * counts first, then the number of shared anchors, then the latest line. One
 * shared file alone is not enough: nearly everything touches a common doc.
 */
function bestOverlap(
  mine: string[],
  settled: FindingLine[],
  moves: Record<string, string>,
): FindingLine | undefined {
  const ranked = settled
    .map((line, order) => {
      const shared = anchors(line.finding, moves).filter((anchor) => mine.includes(anchor));
      const ids = shared.filter((anchor) => anchor.startsWith("id:")).length;
      return { line, ids, total: shared.length, order };
    })
    .filter(({ ids, total }) => ids > 0 || total >= 2)
    .sort((a, b) => b.ids - a.ids || b.total - a.total || b.order - a.order);
  return ranked[0]?.line;
}
