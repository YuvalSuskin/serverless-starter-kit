// pnpm sweep match: turns the checkers' findings into ledger-ready ones (an
// SW- ID, a fingerprint) and matches each against the ledger (spec §5 step 7,
// §8), so the lead never computes either by hand.
import { anchors, fingerprint, type Match, matchFinding, quotesOverlap } from "./ledger.ts";
import { DraftFinding, type Finding, type LedgerLine } from "./schema.ts";
import { nextIds, type SweepState } from "./state.ts";

export type { DraftFinding } from "./schema.ts";

export interface MatchInput {
  state: SweepState;
  ledger: LedgerLine[];
  repoText: (ref: string) => string;
  moves?: Record<string, string>;
  /** The findings open sweep beads hold: filed, not yet settled. */
  open?: { bead: string; findings: Finding[] }[];
}

export function assignAndMatch(
  drafts: unknown[],
  input: MatchInput,
): {
  results: { finding: Finding; match: Match }[];
  dropped: { index: number; reason: string }[];
  state: SweepState;
} {
  // A finding that fails the schema is dropped and reported, never filed
  // half-formed (spec §14), and spends no ID.
  const dropped: { index: number; reason: string }[] = [];
  const parsed = drafts.flatMap((draft, index) => {
    const result = DraftFinding.safeParse(draft);
    if (result.success) return [result.data];
    dropped.push({ index, reason: result.error.message });
    return [];
  });
  const ids = nextIds(input.state, parsed.length, input.ledger);
  const results: { finding: Finding; match: Match }[] = [];
  for (const [index, draft] of parsed.entries()) {
    const finding: Finding = {
      ...draft,
      id: ids[index] ?? "",
      fingerprint: fingerprint(anchors(draft, input.moves)),
    };
    const filed = alreadyFiled(finding, input.open ?? [], results, input.moves);
    const settled = filed ?? matchFinding(finding, input.ledger, input.repoText, input.moves);
    const open = input.open ?? [];
    const match =
      settled.kind === "new" || settled.kind === "related"
        ? (overlapsOpen(finding, open, input.moves) ?? settled)
        : settled;
    results.push({ finding, match });
  }
  const last = ids.at(-1);
  const nextId = last === undefined ? input.state.nextId : Number(last.slice(3)) + 1;
  return { results, dropped, state: { ...input.state, nextId } };
}

/**
 * A finding already waiting to be answered: in an open sweep bead, or found
 * earlier in this run. Same places (fingerprint, recomputed) and overlapping
 * quotes, as for a settled item.
 */
function alreadyFiled(
  finding: Finding,
  open: { bead: string; findings: Finding[] }[],
  earlier: { finding: Finding }[],
  moves: Record<string, string> | undefined,
): Match | undefined {
  const same = (other: Finding) =>
    fingerprint(anchors(other, moves)) === finding.fingerprint && quotesOverlap(finding, other);
  for (const { bead, findings } of open) {
    const held = findings.find(same);
    if (held !== undefined) return { kind: "filed", settled: held.id, bead };
  }
  const first = earlier.find((result) => same(result.finding));
  return first === undefined ? undefined : { kind: "filed", settled: first.finding.id };
}

/**
 * An open bead's finding sharing a stable ID, or two anchors, with this one:
 * perhaps the same item seen with a side more or fewer. The lead judges it.
 */
function overlapsOpen(
  finding: Finding,
  open: { bead: string; findings: Finding[] }[],
  moves: Record<string, string> | undefined,
): Match | undefined {
  const mine = new Set(anchors(finding, moves));
  for (const { bead, findings } of open) {
    for (const held of findings) {
      const shared = anchors(held, moves).filter((anchor) => mine.has(anchor));
      if (shared.some((anchor) => anchor.startsWith("id:")) || shared.length >= 2) {
        return { kind: "candidate", settled: held.id, bead };
      }
    }
  }
  return undefined;
}
