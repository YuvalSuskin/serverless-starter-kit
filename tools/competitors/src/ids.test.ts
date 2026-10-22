import { describe, expect, it } from "vitest";

import { claimId, reviewIds } from "./ids.ts";

describe("reviewIds", () => {
  it("uses the source's own ID when there is one", () => {
    expect(
      reviewIds("google", [{ posted: null, source_id: "694cfcb1eeee0d9b184fad86", text: "x" }]),
    ).toEqual(["google-694cfcb1eeee0d9b184fad86"]);
  });

  it("hashes posted|text into 10 hex digits when the source has no ID", () => {
    const [id] = reviewIds("pasted", [{ posted: "2026-01-02", text: "hello" }]);
    expect(id).toMatch(/^pasted-[0-9a-f]{10}$/);
    expect(reviewIds("pasted", [{ posted: "2026-01-02", text: "hello" }])).toEqual([id]);
    expect(reviewIds("pasted", [{ posted: "2026-01-03", text: "hello" }])).not.toEqual([id]);
  });

  it("gives two rating-only reviews on the same day distinct, repeatable IDs (C5)", () => {
    const twins = [
      { posted: "2026-01-02", text: "" },
      { posted: "2026-01-02", text: "" },
    ];
    const ids = reviewIds("pasted", twins);
    expect(new Set(ids).size).toBe(2);
    expect(ids[1]).toBe(`${ids[0] ?? ""}-2`);
    expect(reviewIds("pasted", twins)).toEqual(ids);
  });
});

describe("claimId", () => {
  it("hashes url|kind|text", () => {
    const id = claimId({ kind: "price", text: "$350", url: "https://a.example/p" });
    expect(id).toMatch(/^site-[0-9a-f]{10}$/);
    expect(claimId({ kind: "price", text: "$400", url: "https://a.example/p" })).not.toBe(id);
  });
});
