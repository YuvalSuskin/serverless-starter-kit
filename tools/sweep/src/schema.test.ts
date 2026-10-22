import { expect, it } from "vitest";

import { Finding, type FindingLine, isFindingLine, LedgerLine, Topic } from "./schema.ts";
import { sampleFinding, sampleFindingLine, sampleTopic } from "./testing.ts";

it("accepts a finding and refuses one without sides", () => {
  expect(Finding.safeParse(sampleFinding()).success).toBe(true);
  const withoutSides: Partial<Finding> = sampleFinding();
  delete withoutSides.sides;
  expect(Finding.safeParse(withoutSides).success).toBe(false);
});

it("refuses a finding ID that is not SW- and three digits", () => {
  expect(Finding.safeParse(sampleFinding({ id: "SW-1" })).success).toBe(false);
  expect(Finding.safeParse(sampleFinding({ id: "F-001" })).success).toBe(false);
});

it("refuses a side whose ref is neither a path, a bead nor a memory", () => {
  const finding = sampleFinding();
  const side = { ...finding.sides[0], ref: "https://example.com/x" };
  expect(Finding.safeParse({ ...finding, sides: [side] }).success).toBe(false);
  for (const ref of ["bead:acme-al7", "memory:fewer-questions", "docs/decisions/x.md"]) {
    expect(Finding.safeParse({ ...finding, sides: [{ ...side, ref }] }).success).toBe(true);
  }
});

it("accepts a finding line, an auto answer and an event line", () => {
  expect(LedgerLine.safeParse(sampleFindingLine()).success).toBe(true);
  const auto = sampleFindingLine({
    owner: { answer: "auto", note: "", batch: 2, round: 1, date: "2026-10-02" },
  });
  expect(LedgerLine.safeParse(auto).success).toBe(true);
  const event = {
    event: "closed",
    id: "SW-001",
    date: "2026-10-05",
    bead: "acme-xyz",
    note: "",
  };
  expect(LedgerLine.safeParse(event).success).toBe(true);
});

it("refuses a finding line without the owner's answer", () => {
  const withoutOwner: Partial<FindingLine> = sampleFindingLine();
  delete withoutOwner.owner;
  expect(LedgerLine.safeParse(withoutOwner).success).toBe(false);
});

it("tells finding lines from event lines", () => {
  const event = LedgerLine.parse({ event: "closed", id: "SW-001", date: "2026-10-05", note: "" });
  expect(isFindingLine(LedgerLine.parse(sampleFindingLine()))).toBe(true);
  expect(isFindingLine(event)).toBe(false);
});

it("accepts a topic and refuses one without files", () => {
  expect(Topic.safeParse(sampleTopic()).success).toBe(true);
  const withoutFiles: Partial<Topic> = sampleTopic();
  delete withoutFiles.files;
  expect(Topic.safeParse(withoutFiles).success).toBe(false);
});

it("accepts refs to real paths with parentheses and brackets", () => {
  const finding = sampleFinding();
  for (const ref of [
    "frontend/src/app/(marketing)/page.tsx",
    "frontend/src/app/(app)/share/[code]/page.tsx",
    "design/fonts/Example[wdth,wght].ttf",
  ]) {
    const sides = [{ type: "code" as const, ref, quote: "x" }];
    expect(
      Finding.safeParse({ ...finding, sides, prediction: { ...finding.prediction, winner: 0 } })
        .success,
    ).toBe(true);
  }
  for (const ref of ["/etc/passwd", "has space.md", "https://x.dev/a"]) {
    const sides = [{ type: "code" as const, ref, quote: "x" }];
    expect(Finding.safeParse({ ...finding, sides }).success).toBe(false);
  }
});

it("refuses empty quotes, which would match any text", () => {
  const finding = sampleFinding();
  const sides = finding.sides.map((side) => ({ ...side, quote: " " }));
  expect(Finding.safeParse({ ...finding, sides }).success).toBe(false);
  const line = sampleFindingLine();
  const losing = line.resolution.endState.losing.map((l) => ({ ...l, lostQuote: "" }));
  const endState = { ...line.resolution.endState, losing };
  expect(
    LedgerLine.safeParse({ ...line, resolution: { ...line.resolution, endState } }).success,
  ).toBe(false);
});

it("refuses unknown keys, so a misspelt stableId never silently changes a fingerprint", () => {
  const finding = sampleFinding();
  const sides = [{ ...finding.sides[0], stableID: "ADD-L1" }];
  expect(Finding.safeParse({ ...finding, sides }).success).toBe(false);
  expect(Finding.safeParse({ ...finding, extra: 1 }).success).toBe(false);
});

it("refuses a winner that is missing or points past the sides", () => {
  const finding = sampleFinding();
  expect(
    Finding.safeParse({ ...finding, prediction: { ...finding.prediction, winner: 2 } }).success,
  ).toBe(false);
  const line = sampleFindingLine();
  const noWinner = { ...line.owner, answer: "winner" as const, winner: undefined };
  expect(LedgerLine.safeParse({ ...line, owner: noWinner }).success).toBe(false);
  const pastSides = { ...line.owner, winner: 5 };
  expect(LedgerLine.safeParse({ ...line, owner: pastSides }).success).toBe(false);
});
