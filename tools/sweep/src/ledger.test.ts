import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import type { Finding, FindingLine, LedgerLine } from "./schema.ts";

import { anchors, appendLedger, fingerprint, matchFinding, readLedger } from "./ledger.ts";
import { sampleFinding, sampleFindingLine } from "./testing.ts";

const SPEC = "docs/product/upload-files.md";
const CODE = "backend/src/domain/upload.ts";
const KEPT = "Up to 20 MB per file.";
const LOST = "const MAX_BYTES = 50 * 1024 * 1024;";

function withPrint(finding: Finding): Finding {
  return { ...finding, fingerprint: fingerprint(anchors(finding)) };
}

function settled(overrides: Partial<FindingLine> = {}): FindingLine {
  return sampleFindingLine({ finding: withPrint(sampleFinding()), ...overrides });
}

/** The repo as a map from ref to text; anything else is empty. */
const repo =
  (files: Record<string, string>) =>
  (ref: string): string =>
    files[ref] ?? "";
const fixed = repo({ [SPEC]: KEPT, [CODE]: "const MAX_BYTES = 20 * 1024 * 1024;" });
const broken = repo({ [SPEC]: KEPT, [CODE]: LOST });
const again = (overrides: Partial<Finding> = {}) =>
  withPrint(sampleFinding({ id: "SW-020", ...overrides }));

it("keeps the fingerprint when only the wording, the topic or the lines change", () => {
  const first = sampleFinding();
  const second = sampleFinding({
    claim: "How big a single uploaded file may be",
    topic: "Uploads",
    sides: first.sides.map((side) => ({ ...side, lines: [40, 42] as [number, number] })),
  });
  expect(fingerprint(anchors(second))).toBe(fingerprint(anchors(first)));
});

it("keeps the fingerprint when a side's file was archived since, by the archive's path rule", () => {
  const at = (ref: string) =>
    sampleFinding({ sides: [{ type: "plan", ref, quote: "x", stableId: "B4" }] });
  expect(fingerprint(anchors(at("docs/archive/superpowers/plans/p.md")))).toBe(
    fingerprint(anchors(at("docs/superpowers/plans/p.md"))),
  );
  expect(fingerprint(anchors(at("./docs/superpowers/plans/../plans/p.md")))).toBe(
    fingerprint(anchors(at("docs/superpowers/plans/p.md"))),
  );
});

it("changes the fingerprint when a stable ID, a ref or a bead field differs", () => {
  const side = (ref: string, stableId?: string, field?: string) =>
    sampleFinding({ sides: [{ type: "decision", ref, quote: "x", stableId, field }] });
  const one = fingerprint(anchors(side("docs/decisions/a.md", "B4")));
  expect(fingerprint(anchors(side("docs/decisions/a.md", "B5")))).not.toBe(one);
  expect(fingerprint(anchors(side("docs/product/b.md", "B4")))).not.toBe(one);
  expect(fingerprint(anchors(side("bead:acme-al7", undefined, "description")))).not.toBe(
    fingerprint(anchors(side("bead:acme-al7", undefined, "design"))),
  );
});

it("matches on anchors recomputed now, not on the fingerprint stored in the ledger", () => {
  const stale = settled();
  stale.finding.fingerprint = "written-by-an-older-version";
  expect(matchFinding(again(), [stale], broken)).toEqual({ kind: "pending", settled: "SW-001" });
});

it("calls a settled finding whose losing text is back a regression", () => {
  const line = settled({ resolution: { ...settled().resolution, codePending: false } });
  expect(matchFinding(again(), [line], broken)).toEqual({
    kind: "regression",
    settled: "SW-001",
  });
});

it("leaves a pending code fix alone until a closed event, and ignores other events", () => {
  const restored: LedgerLine = { event: "restored", id: "SW-001", date: "2026-10-04", note: "" };
  expect(matchFinding(again(), [settled(), restored], broken)).toEqual({
    kind: "pending",
    settled: "SW-001",
  });
  const closed: LedgerLine = { event: "closed", id: "SW-001", date: "2026-10-05", note: "" };
  expect(matchFinding(again(), [settled(), closed], broken)).toEqual({
    kind: "regression",
    settled: "SW-001",
  });
});

it("does not refile a regression already recorded, until it is closed again", () => {
  const line = settled({ resolution: { ...settled().resolution, codePending: false } });
  const filed: LedgerLine = { event: "regression", id: "SW-001", date: "2026-10-06", note: "" };
  expect(matchFinding(again(), [line, filed], broken)).toEqual({
    kind: "pending",
    settled: "SW-001",
  });
  const closed: LedgerLine = { event: "closed", id: "SW-001", date: "2026-10-07", note: "" };
  expect(matchFinding(again(), [line, filed, closed], broken).kind).toBe("regression");
});

it("keeps a different contradiction between the same two files apart from a settled one", () => {
  const other = again({
    sides: [
      {
        type: "product-spec",
        ref: SPEC,
        quote: "At most 500 files per visitor.",
        stableId: "ADD-L1",
      },
      { type: "code", ref: CODE, quote: "const MAX_FILES = 1000;" },
    ],
  });
  expect(matchFinding(other, [settled()], broken)).toEqual({
    kind: "candidate",
    settled: "SW-001",
  });
});

it("suppresses what the owner called not a contradiction, while its texts are still there", () => {
  const line = settled({
    owner: { answer: "not-a-contradiction", note: "", batch: 2, round: 1, date: "2026-10-02" },
  });
  // The checker quotes a longer stretch of the same, unchanged passage.
  const longer = again({
    sides: sampleFinding().sides.map((side, index) =>
      index === 1 ? { ...side, quote: `// Limit\n${LOST}` } : side,
    ),
  });
  const text = repo({ [SPEC]: KEPT, [CODE]: `// Limit\n${LOST}` });
  expect(matchFinding(longer, [line], text)).toEqual({ kind: "suppressed", settled: "SW-001" });
  const edited = repo({ [SPEC]: "Up to 25 MB per file.", [CODE]: LOST });
  expect(matchFinding(again(), [line], edited)).toEqual({ kind: "new" });
});

it("returns a candidate on a shared stable ID, preferring the latest settled line", () => {
  const older = settled();
  const newer = settled({
    finding: withPrint(
      sampleFinding({
        id: "SW-005",
        sides: [
          {
            type: "design-spec",
            ref: "docs/superpowers/specs/s.md",
            quote: "20 MB",
            stableId: "ADD-L1",
          },
        ],
      }),
    ),
  });
  const other = again({
    sides: [
      {
        type: "claude-md",
        ref: "backend/CLAUDE.md",
        quote: "Files up to 20 MB",
        stableId: "ADD-L1",
      },
    ],
  });
  expect(matchFinding(other, [older, newer], fixed)).toEqual({
    kind: "candidate",
    settled: "SW-005",
  });
});

it("does not call a finding sharing one common file a candidate", () => {
  const other = again({
    topic: "Sign-in",
    sides: [
      { type: "product-spec", ref: SPEC, quote: "Visitors never sign in." },
      { type: "claude-md", ref: "frontend/CLAUDE.md", quote: "Visitors sign in with a code." },
    ],
  });
  expect(matchFinding(other, [settled()], fixed)).toEqual({ kind: "new" });
});

it("calls a finding sharing only the topic related", () => {
  const sameTopic = again({ sides: [{ type: "claude-md", ref: "backend/CLAUDE.md", quote: "y" }] });
  expect(matchFinding(sameTopic, [settled()], fixed)).toEqual({
    kind: "related",
    settled: "SW-001",
  });
});

it("appends checked lines and refuses one that fails the schema, leaving the file unchanged", () => {
  const root = mkdtempSync(path.join(tmpdir(), "ledger-"));
  const file = path.join(root, "docs/sweeps/ledger.jsonl");
  appendLedger(root, settled());
  appendLedger(root, { event: "closed", id: "SW-001", date: "2026-10-05", note: "" });
  const before = readFileSync(file, "utf8");
  expect(() => {
    appendLedger(root, { event: "closed", id: "nope" } as unknown as LedgerLine);
  }).toThrow();
  expect(readFileSync(file, "utf8")).toBe(before);
  expect(readLedger(root)).toHaveLength(2);
});

it("refuses a finding ID used before, and an event for an ID it has never seen", () => {
  const root = mkdtempSync(path.join(tmpdir(), "ledger-"));
  appendLedger(root, settled());
  expect(() => {
    appendLedger(root, settled());
  }).toThrow(/SW-001 is already in the ledger/);
  expect(() => {
    appendLedger(root, { event: "closed", id: "SW-099", date: "2026-10-05", note: "" });
  }).toThrow(/SW-099 is not in the ledger/);
});

it("reads an absent ledger as empty", () => {
  expect(readLedger(mkdtempSync(path.join(tmpdir(), "ledger-")))).toEqual([]);
});

it("spells a bead field one way, whatever the checker wrote", () => {
  const at = (field: string) =>
    sampleFinding({ sides: [{ type: "bead", ref: "bead:acme-al7", quote: "x", field }] });
  expect(fingerprint(anchors(at("Acceptance criteria")))).toBe(
    fingerprint(anchors(at("acceptance_criteria"))),
  );
});
