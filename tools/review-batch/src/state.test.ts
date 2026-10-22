import { describe, expect, it } from "vitest";

import {
  type Answer,
  answerKey,
  canSubmit,
  mergeStored,
  pageStatus,
  progress,
  readyToSubmit,
  sortCards,
} from "./state.ts";
import { sampleCard } from "./testing.ts";

const approve: Answer = { choice: "approve", note: "", calls: {} };

describe("answerKey", () => {
  it("joins the bead id and the round", () => {
    expect(answerKey(sampleCard({ id: "acme-x1", round: 2 }))).toBe("acme-x1--r2");
  });
});

describe("progress", () => {
  it("counts answers that match a card in the batch", () => {
    const cards = [sampleCard({ id: "a" }), sampleCard({ id: "b" })];
    expect(progress(cards, { "a--r1": approve })).toEqual({ answered: 1, total: 2 });
  });

  it("does not count a first-round answer for the card's second round", () => {
    const cards = [sampleCard({ id: "a", round: 2 })];
    expect(progress(cards, { "a--r1": approve })).toEqual({ answered: 0, total: 1 });
  });
});

describe("progress with an incomplete answer", () => {
  it("does not count a rejection that has no note yet", () => {
    const cards = [sampleCard({ id: "a" })];
    expect(progress(cards, { "a--r1": { ...approve, choice: "reject" } })).toEqual({
      answered: 0,
      total: 1,
    });
  });

  it("survives an answer stored without a note", () => {
    const cards = [sampleCard({ id: "a" })];
    const stored = { choice: "reject", calls: {} } as unknown as Answer;
    expect(canSubmit(cards, { "a--r1": stored })).toBe(false);
  });
});

describe("canSubmit", () => {
  const cards = [sampleCard({ id: "a" }), sampleCard({ id: "b" })];

  it("is false while a card is unanswered", () => {
    expect(canSubmit(cards, { "a--r1": approve })).toBe(false);
  });

  it("is true when every card is answered", () => {
    expect(canSubmit(cards, { "a--r1": approve, "b--r1": { ...approve, choice: "later" } })).toBe(
      true,
    );
  });

  it("is false when a rejection has no note", () => {
    expect(
      canSubmit(cards, { "a--r1": approve, "b--r1": { ...approve, choice: "reject", note: "  " } }),
    ).toBe(false);
  });

  it("is false when an approval with a note has no note", () => {
    expect(
      canSubmit(cards, { "a--r1": approve, "b--r1": { ...approve, choice: "approve-note" } }),
    ).toBe(false);
  });

  it("is false for an empty batch", () => {
    expect(canSubmit([], {})).toBe(false);
  });
});

describe("sortCards", () => {
  it("puts cards that unblock more first, then orders by title, and blocked cards last", () => {
    const sorted = sortCards([
      sampleCard({ id: "few", title: "B", unblocks: ["x"] }),
      sampleCard({
        id: "blocked",
        title: "A",
        unblocks: ["x", "y", "z"],
        blocked: "Needs the event spec",
      }),
      sampleCard({ id: "many", title: "C", unblocks: ["x", "y"] }),
      sampleCard({ id: "tie", title: "A", unblocks: ["x"] }),
    ]);
    expect(sorted.map((card) => card.id)).toEqual(["many", "tie", "few", "blocked"]);
  });

  it("does not change the list it is given", () => {
    const cards = [sampleCard({ id: "a", unblocks: [] }), sampleCard({ id: "b", unblocks: ["x"] })];
    sortCards(cards);
    expect(cards.map((card) => card.id)).toEqual(["a", "b"]);
  });
});

describe("pageStatus", () => {
  it("is open when nothing is stored yet", () => {
    expect(pageStatus(undefined, 1)).toBe("open");
  });

  it("follows the stored status for this round", () => {
    expect(pageStatus({ status: "submitted", round: 1 }, 1)).toBe("submitted");
    expect(pageStatus({ status: "applied", round: 1 }, 1)).toBe("applied");
  });

  it("is open when the store holds an earlier round", () => {
    expect(pageStatus({ status: "applied", round: 1 }, 2)).toBe("open");
  });

  it("is stale in a tab left open from an earlier round", () => {
    expect(pageStatus({ status: "open", round: 2 }, 1)).toBe("stale");
  });
});

describe("mergeStored", () => {
  it("takes stored answers except where the owner has unsaved changes", () => {
    const local = { "a--r1": { ...approve, choice: "reject" as const, note: "Typing" } };
    const stored = { "a--r1": approve, "b--r1": approve };
    expect(mergeStored(local, stored, new Set(["a--r1"]))).toEqual({
      "a--r1": local["a--r1"],
      "b--r1": approve,
    });
  });
});

describe("readyToSubmit", () => {
  const cards = [sampleCard({ id: "a" })];

  it("waits while an answer is not yet saved", () => {
    expect(readyToSubmit(cards, { "a--r1": approve }, 1)).toBe(false);
  });

  it("is ready once every answer is complete and saved", () => {
    expect(readyToSubmit(cards, { "a--r1": approve }, 0)).toBe(true);
  });
});
