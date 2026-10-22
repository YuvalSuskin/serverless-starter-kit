import path from "node:path";
import { describe, expect, it } from "vitest";

import { readYamlList } from "./files.ts";
import { mergeInsights, pending } from "./insights.ts";
import { InsightEntry } from "./schema.ts";
import { fixtureRoot } from "./testing.ts";

const entry = (ref: string, feature = "price") => ({
  mentions: [{ feature, kind: "pain" as const, sentiment: "negative" as const }],
  persona: "buyer",
  ref,
  summary_en: "Too expensive.",
  tagged: "2026-10-05",
});
const insights = (root: string) =>
  readYamlList(path.join(root, "docs/competitors/alpha/insights.yaml"), InsightEntry);

describe("pending", () => {
  it("lists the raw records that have no insight yet, with their text", () => {
    const refs = pending(fixtureRoot("valid"), "alpha").map((record) => record.ref);
    expect(refs.toSorted((a, b) => a.localeCompare(b))).toEqual([
      "google-590e08da1ea33c033d8b55c9",
      "site-aaaaaaaaaa",
    ]);
  });
});

describe("pending, for re-tagging", () => {
  it("lists every raw record, tagged or not, with all", () => {
    const refs = pending(fixtureRoot("valid"), "alpha", { all: true }).map((record) => record.ref);
    expect(refs.toSorted((a, b) => a.localeCompare(b))).toEqual([
      "google-590e08da1ea33c033d8b55c9",
      "google-694cfcb1eeee0d9b184fad86",
      "site-aaaaaaaaaa",
      "site-bbbbbbbbbb",
    ]);
  });
});

describe("mergeInsights", () => {
  it("adds entries for untagged records", () => {
    const root = fixtureRoot("valid");
    expect(mergeInsights(root, "alpha", [entry("site-aaaaaaaaaa")], { retag: false })).toEqual({
      added: 1,
      replaced: 0,
    });
    expect(insights(root).map((i) => i.ref)).toContain("site-aaaaaaaaaa");
    expect(pending(root, "alpha").map((r) => r.ref)).toEqual(["google-590e08da1ea33c033d8b55c9"]);
  });

  it("rejects a ref to no raw record, an unknown feature, and a withdrawn one", () => {
    const root = fixtureRoot("valid");
    expect(() =>
      mergeInsights(root, "alpha", [entry("site-zzzzzzzzzz")], { retag: false }),
    ).toThrow(/site-zzzzzzzzzz/);
    expect(() =>
      mergeInsights(root, "alpha", [entry("site-aaaaaaaaaa", "rsvp-calls")], { retag: false }),
    ).toThrow(/rsvp-calls/);
    expect(() =>
      mergeInsights(root, "alpha", [entry("site-aaaaaaaaaa", "old-search")], { retag: false }),
    ).toThrow(/old-search.*withdrawn/);
    expect(insights(root)).toHaveLength(2);
  });

  it("refuses to overwrite a tagged record unless re-tagging", () => {
    const root = fixtureRoot("valid");
    const ref = "google-694cfcb1eeee0d9b184fad86";
    expect(() => mergeInsights(root, "alpha", [entry(ref)], { retag: false })).toThrow(
      /already tagged/,
    );
    expect(mergeInsights(root, "alpha", [entry(ref)], { retag: true })).toEqual({
      added: 0,
      replaced: 1,
    });
    expect(insights(root).find((i) => i.ref === ref)?.mentions).toHaveLength(1);
  });
});
