import { describe, expect, it } from "vitest";

import { BatchSchema } from "./cards.ts";
import { sampleCard } from "./testing.ts";

function parse(cards: unknown[]) {
  return BatchSchema.safeParse({ batch: 1, round: 1, title: "Review batch 1", cards });
}

describe("BatchSchema", () => {
  it("accepts a valid batch", () => {
    expect(parse([sampleCard()]).success).toBe(true);
  });

  it("refuses a journey with no steps", () => {
    const card = sampleCard();
    expect(parse([{ ...card, pitch: { ...card.pitch, journey: [] } }]).success).toBe(false);
  });

  it("refuses a journey of six steps", () => {
    const card = sampleCard();
    const journey = ["1", "2", "3", "4", "5", "6"];
    expect(parse([{ ...card, pitch: { ...card.pitch, journey } }]).success).toBe(false);
  });

  it("refuses four calls on a spec card", () => {
    const card = sampleCard();
    const call = { question: "Q?", recommendation: "R." };
    expect(
      parse([{ ...card, pitch: { ...card.pitch, calls: [call, call, call, call] } }]).success,
    ).toBe(false);
  });

  it("accepts four calls on a findings card", () => {
    const card = sampleCard({ kind: "findings" });
    const call = { question: "Q?", recommendation: "R." };
    expect(
      parse([{ ...card, pitch: { ...card.pitch, calls: [call, call, call, call] } }]).success,
    ).toBe(true);
  });

  it("names the missing pitch part", () => {
    const card = sampleCard();
    const pitch: Record<string, unknown> = { ...card.pitch };
    delete pitch.who;
    const result = parse([{ ...card, pitch }]);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(
      "cards.0.pitch.who",
    );
  });

  it("refuses two cards for the same bead and round", () => {
    expect(parse([sampleCard(), sampleCard()]).success).toBe(false);
  });

  it("accepts the same bead in two rounds", () => {
    expect(
      BatchSchema.safeParse({
        batch: 1,
        round: 2,
        title: "Review batch 1",
        cards: [sampleCard({ round: 1 }), sampleCard({ round: 2 })],
      }).success,
    ).toBe(true);
  });

  it("refuses a card from a later round than the batch", () => {
    expect(parse([sampleCard({ round: 2 })]).success).toBe(false);
  });

  it("refuses an empty draft on a card that is not blocked", () => {
    expect(parse([sampleCard({ draft: " " })]).success).toBe(false);
    expect(parse([sampleCard({ draft: "", blocked: "Needs the event spec" })]).success).toBe(true);
  });

  it("refuses a bead id the store cannot hold", () => {
    expect(parse([sampleCard({ id: 'acme-a"b' })]).success).toBe(false);
    expect(parse([sampleCard({ id: "Acme a" })]).success).toBe(false);
  });

  it("accepts a sweep card, whose first call names the winning side", () => {
    const card = sampleCard({ kind: "sweep" });
    expect(parse([card]).success).toBe(true);
  });

  it("refuses a sweep card without the call naming the winner", () => {
    const card = sampleCard({ kind: "sweep" });
    const noCalls = { ...card, pitch: { ...card.pitch, calls: [] } };
    expect(parse([noCalls]).success).toBe(false);
  });

  it("refuses an unknown kind", () => {
    expect(parse([{ ...sampleCard(), kind: "idea" }]).success).toBe(false);
  });
});
