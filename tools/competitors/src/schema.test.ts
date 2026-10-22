import { describe, expect, it } from "vitest";

import { Feature, Meta, ReviewRecord, SOURCES } from "./schema.ts";

describe("the sources", () => {
  it("collects reviews from Google, or takes them pasted; the site is read for claims", () => {
    expect([...SOURCES]).toEqual(["google", "pasted"]);
  });

  it("refuses a review from a site no adapter collects", () => {
    const review = {
      id: "other-1",
      source: "other",
      url: null,
      posted: null,
      rating: null,
      rating_scale: null,
      text: "x",
      fetched: "2026-10-22",
      gone: null,
    };
    expect(ReviewRecord.safeParse(review).success).toBe(false);
    expect(ReviewRecord.safeParse({ ...review, id: "google-1", source: "google" }).success).toBe(
      true,
    );
  });
});

describe("a competitor's listings", () => {
  const meta = (listings: object) => ({
    name: "Alpha",
    slug: "alpha",
    aliases: [],
    domains: ["alpha.example"],
    confirmed: "2026-10-22",
    listings,
  });

  it("are a Google place and the competitor's own pages", () => {
    expect(Meta.safeParse(meta({ google: null, site: ["https://alpha.example/"] })).success).toBe(
      true,
    );
  });

  it("have no slot for a review site the template does not collect", () => {
    const listing = { biz_id: 1, url: "https://reviews.example/biz/1" };
    expect(Meta.safeParse(meta({ otherreviewsite: listing })).success).toBe(false);
  });
});

describe("a feature's stage", () => {
  const feature = (stage: string, type = "feature") => ({
    id: "checkout-flow",
    name: "Checkout flow",
    type,
    stage,
    glossary: null,
    aliases: [],
  });

  it("is any kebab-case step of the product's own lifecycle", () => {
    expect(Feature.safeParse(feature("checkout")).success).toBe(true);
    expect(Feature.safeParse(feature("first-run")).success).toBe(true);
    expect(Feature.safeParse(feature("First run")).success).toBe(false);
  });

  it("is aspect for an aspect, and only for an aspect", () => {
    expect(Feature.safeParse(feature("aspect", "aspect")).success).toBe(true);
    expect(Feature.safeParse(feature("checkout", "aspect")).success).toBe(false);
    expect(Feature.safeParse(feature("aspect")).success).toBe(false);
  });
});
