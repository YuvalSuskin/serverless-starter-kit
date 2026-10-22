// The sweep's records: what the workflow's agents return, what the lead files,
// what the ledger keeps (spec docs/superpowers/specs/2026-09-30-sweep-design.md
// §6, §8, §9). One schema for all of them, so a record that passes here is
// usable everywhere. Objects are strict: a misspelt key (stableID) must fail,
// not vanish, or a settled finding's fingerprint silently changes.
import * as z from "zod";

const Text = z.string().trim().min(1);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "A date, YYYY-MM-DD");
const Lines = z.tuple([z.number().int().min(1), z.number().int().min(1)]);
const Index = z.number().int().min(0);
const FindingId = z.string().regex(/^SW-\d{3,}$/, "SW- and at least three digits");

// Repo paths may hold parentheses and brackets (Next.js route groups, font
// axes); they never start with "/" or a URL scheme, and hold no spaces.
const Ref = z
  .string()
  .regex(
    /^(bead:\S+|memory:\S+|(?![a-z][a-z0-9+.-]*:)[^\s/]\S*)$/,
    "A repo path, bead:<id> or memory:<key>",
  );

const SideType = z.enum([
  "decision",
  "product-spec",
  "design-spec",
  "plan",
  "research",
  "claude-md",
  "skill",
  "agent",
  "design",
  "memory",
  "bead",
  "code",
  "test",
]);

export const Side = z.strictObject({
  type: SideType,
  ref: Ref,
  field: Text.optional(),
  lines: Lines.optional(),
  // An empty quote would match any text (verify, regressions).
  quote: Text,
  stableId: Text.optional(),
});
export type Side = z.infer<typeof Side>;

export const FindingKindSchema = z.enum([
  "conflict",
  "code-drift",
  "unrecorded-decision",
  "unmarked-supersession",
  "duplicate",
  "promote",
  "archive",
]);
export type FindingKind = z.infer<typeof FindingKindSchema>;

const FindingFields = z.strictObject({
  id: FindingId,
  fingerprint: Text,
  kind: FindingKindSchema,
  topic: Text,
  claim: Text,
  rootCause: Text,
  sides: z.array(Side).min(1),
  reach: z.array(Side),
  proposedFix: Text,
  prediction: z.strictObject({
    winner: Index.nullable(),
    rule: Text,
    confidence: z.enum(["low", "medium", "high"]),
  }),
  suspectedCause: Text.optional(),
});

function winnerIsASide(f: { prediction: { winner: number | null }; sides: unknown[] }): boolean {
  return f.prediction.winner === null || f.prediction.winner < f.sides.length;
}
const WINNER_ISSUE = {
  message: "The predicted winner must be one of the sides",
  path: ["prediction", "winner"],
};

export const Finding = FindingFields.refine(winnerIsASide, WINNER_ISSUE);
export type Finding = z.infer<typeof Finding>;

/** What a checker returns: a finding before the tool gives it an ID and a fingerprint. */
export const DraftFinding = FindingFields.omit({ id: true, fingerprint: true }).refine(
  winnerIsASide,
  WINNER_ISSUE,
);
export type DraftFinding = z.infer<typeof DraftFinding>;

const Origin = z.strictObject({
  written: z.string(),
  lastChanged: z.string(),
  approvedOn: Day.optional(),
  commit: z.string(),
  pr: z.number().int().optional(),
  message: z.string(),
  // Nearly every commit carries the Claude trailer, so approval is read from
  // Decided:/Status: lines and review-batch commits instead (spec §6).
  ownerApproved: z.boolean(),
  evidence: z.string(),
});
export type Origin = z.infer<typeof Origin>;

const EndState = z.strictObject({
  home: Side.nullable(),
  losing: z.array(
    z.strictObject({
      ref: Ref,
      became: z.enum(["removed", "rewritten", "link"]),
      lostQuote: Text,
    }),
  ),
});

const custom = (message: string, path: string[]) => ({ code: "custom" as const, message, path });

export const FindingLine = z
  .strictObject({
    finding: Finding,
    found: z.strictObject({ run: Text, date: Day, commit: Text }),
    foundBy: z.enum(["sweep", "escape"]),
    rank: z.number().int().min(0),
    origins: z.array(Origin),
    context: z.strictObject({
      firstSide: Index,
      gapDays: z.number().min(0),
      testCovered: z.boolean(),
    }),
    owner: z.strictObject({
      // auto: a truth-preserving item applied without a card (spec §6).
      answer: z.enum(["winner", "both-wrong", "not-a-contradiction", "auto"]),
      winner: Index.optional(),
      note: z.string(),
      batch: z.number().int().min(1),
      round: z.number().int().min(1),
      date: Day,
    }),
    resolution: z.strictObject({
      endState: EndState,
      codePending: z.boolean(),
      // A forgotten memory's text, so `bd remember` can restore it.
      forgottenMemory: z.string().optional(),
      commits: z.array(Text),
      beads: z.array(Text),
      vanished: z.array(Text),
    }),
  })
  .superRefine((line, context) => {
    const sides = line.finding.sides.length;
    const { answer, winner } = line.owner;
    if (answer === "winner" && winner === undefined) {
      context.addIssue(custom("A winner answer names the winner", ["owner", "winner"]));
    }
    if (winner !== undefined && winner >= sides) {
      context.addIssue(custom("The winner must be one of the sides", ["owner", "winner"]));
    }
    if (line.context.firstSide >= sides) {
      context.addIssue(custom("firstSide must be one of the sides", ["context", "firstSide"]));
    }
  });
export type FindingLine = z.infer<typeof FindingLine>;

const EventLine = z.strictObject({
  event: z.enum(["closed", "regression", "restored"]),
  id: FindingId,
  date: Day,
  bead: Text.optional(),
  note: z.string(),
});

export const LedgerLine = z.union([FindingLine, EventLine]);
export type LedgerLine = z.infer<typeof LedgerLine>;

export function isFindingLine(line: LedgerLine): line is FindingLine {
  return "finding" in line;
}

export const Topic = z.strictObject({
  name: Text,
  files: z.array(Text),
  passages: z.array(z.strictObject({ ref: Ref, lines: Lines })),
  codePaths: z.array(Text),
  neighbours: z.array(Text),
});
export type Topic = z.infer<typeof Topic>;
