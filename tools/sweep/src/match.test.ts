import { expect, it } from "vitest";

import type { SweepState } from "./state.ts";

import { assignAndMatch, type DraftFinding } from "./match.ts";
import { sampleFinding, sampleFindingLine } from "./testing.ts";

const STATE: SweepState = {
  commit: "abc",
  date: "2026-10-01",
  batch: null,
  pr: null,
  verify: null,
  mergedCommit: null,
  graphKey: "",
  nextId: 1,
};

function draft(overrides: Partial<DraftFinding> = {}): DraftFinding {
  const finding: Partial<ReturnType<typeof sampleFinding>> = sampleFinding();
  delete finding.id;
  delete finding.fingerprint;
  return { ...(finding as DraftFinding), ...overrides };
}

it("gives each checker finding an ID and a fingerprint, and advances nextId", () => {
  const out = assignAndMatch(
    [draft(), draft({ topic: "Sign-in", sides: [{ type: "code", ref: "a.ts", quote: "x" }] })],
    {
      state: STATE,
      ledger: [],
      repoText: () => "",
    },
  );
  expect(out.results.map((r) => r.finding.id)).toEqual(["SW-001", "SW-002"]);
  expect(out.results.every((r) => r.finding.fingerprint.length > 0)).toBe(true);
  expect(out.results.map((r) => r.match.kind)).toEqual(["new", "new"]);
  expect(out.state.nextId).toBe(3);
});

it("matches each finding against the ledger", () => {
  const out = assignAndMatch([draft()], {
    state: { ...STATE, nextId: 2 },
    ledger: [sampleFindingLine()],
    repoText: () => "",
  });
  expect(out.results[0]?.match).toEqual({ kind: "pending", settled: "SW-001" });
});

it("drops a checker finding that fails the schema, reporting why, and spends no ID on it", () => {
  const out = assignAndMatch([{ ...draft(), sides: [] }, draft()], {
    state: STATE,
    ledger: [],
    repoText: () => "",
  });
  expect(out.results.map((r) => r.finding.id)).toEqual(["SW-001"]);
  expect(out.dropped).toHaveLength(1);
  expect(out.dropped[0]?.index).toBe(0);
  expect(out.dropped[0]?.reason).toMatch(/sides/);
  expect(out.state.nextId).toBe(2);
});

it("marks a finding an open sweep bead already holds as filed, instead of filing it again", () => {
  const held = { ...sampleFinding(), id: "SW-003" };
  const out = assignAndMatch([draft()], {
    state: { ...STATE, nextId: 4 },
    ledger: [],
    repoText: () => "",
    open: [{ bead: "acme-s1", findings: [held] }],
  });
  expect(out.results[0]?.match).toEqual({ kind: "filed", settled: "SW-003", bead: "acme-s1" });
});

it("marks the second of two findings about the same text in one run as filed with the first", () => {
  const out = assignAndMatch([draft(), draft({ claim: "Same thing, other words" })], {
    state: STATE,
    ledger: [],
    repoText: () => "",
  });
  expect(out.results.map((r) => r.match)).toEqual([
    { kind: "new" },
    { kind: "filed", settled: "SW-001" },
  ]);
});

it("returns a candidate, naming the bead, when an open bead's finding shares a stable ID but not the places", () => {
  const held = {
    ...sampleFinding({
      sides: [
        {
          type: "product-spec",
          ref: "docs/product/upload-files.md",
          quote: "Up to 20 MB per file.",
          stableId: "ADD-L1",
        },
        { type: "claude-md", ref: "backend/CLAUDE.md", quote: "Files up to 50 MB." },
      ],
    }),
    id: "SW-003",
  };
  const out = assignAndMatch([draft()], {
    state: { ...STATE, nextId: 4 },
    ledger: [],
    repoText: () => "",
    open: [{ bead: "acme-s1", findings: [held] }],
  });
  expect(out.results[0]?.match).toEqual({
    kind: "candidate",
    settled: "SW-003",
    bead: "acme-s1",
  });
});
