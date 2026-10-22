import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Collected } from "./ingest.ts";

import { check } from "./check.ts";
import { readYamlList } from "./files.ts";
import { ingest } from "./ingest.ts";
import { ClaimRecord, ReviewRecord } from "./schema.ts";
import { fixtureRoot } from "./testing.ts";

const RAW = "docs/competitors/alpha/raw";
const TODAY = "2026-10-05";
const KNOWN = "694cfcb1eeee0d9b184fad86"; // in the fixture, not gone
const KNOWN_TEXT = 'The app is too expensive: "auto tag" only worked partly.\n';

const review = (source_id: string, text: string, posted = "2026-10-01") => ({
  posted,
  rating: 80,
  rating_scale: 100,
  source_id,
  text,
  url: null,
});
const reviews = (root: string, source = "google") =>
  readYamlList(path.join(root, RAW, `${source}.yaml`), ReviewRecord);
const claims = (root: string) => readYamlList(path.join(root, RAW, "site.yaml"), ClaimRecord);

describe("ingest: reviews", () => {
  it("appends new reviews with today's date, and leaves known ones alone", () => {
    const root = fixtureRoot("valid");
    const before = reviews(root);
    const report = ingest(
      root,
      "alpha",
      {
        complete: false,
        records: [review(KNOWN, KNOWN_TEXT), review("aaaaaaaaaaaaaaaaaaaaaaaa", "new")],
        source: "google",
      },
      TODAY,
    );
    expect(report).toMatchObject({ added: 1, changedAtSource: [], gone: 0, unchanged: 1 });
    const after = reviews(root);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)).toMatchObject({
      fetched: TODAY,
      gone: null,
      id: "google-aaaaaaaaaaaaaaaaaaaaaaaa",
      source: "google",
      text: "new",
    });
  });

  it("marks a known review gone when a complete collection no longer has it", () => {
    const root = fixtureRoot("valid");
    const report = ingest(root, "alpha", { complete: true, records: [], source: "google" }, TODAY);
    expect(report.gone).toBe(1);
    expect(reviews(root).find((r) => r.id === `google-${KNOWN}`)?.gone).toBe(TODAY);
  });

  it("marks nothing gone when the collection is incomplete (Review Focus 1)", () => {
    const root = fixtureRoot("valid");
    const report = ingest(root, "alpha", { complete: false, records: [], source: "google" }, TODAY);
    expect(report.gone).toBe(0);
    expect(reviews(root).find((r) => r.id === `google-${KNOWN}`)?.gone).toBeNull();
  });

  it("keeps our text when the source edited a review, and reports it (Review Focus 4)", () => {
    const root = fixtureRoot("valid");
    const report = ingest(
      root,
      "alpha",
      { complete: false, records: [review(KNOWN, "other text")], source: "google" },
      TODAY,
    );
    expect(report.changedAtSource).toEqual([`google-${KNOWN}`]);
    expect(reviews(root).find((r) => r.id === `google-${KNOWN}`)?.text).toBe(KNOWN_TEXT);
  });

  it("reports a gone review seen again, and leaves its gone date", () => {
    const root = fixtureRoot("valid");
    const report = ingest(
      root,
      "alpha",
      {
        complete: true,
        records: [review(KNOWN, KNOWN_TEXT), review("590e08da1ea33c033d8b55c9", "")],
        source: "google",
      },
      TODAY,
    );
    expect(report.reappeared).toEqual(["google-590e08da1ea33c033d8b55c9"]);
    expect(reviews(root).find((r) => r.id === "google-590e08da1ea33c033d8b55c9")?.gone).toBe(
      "2026-09-30",
    );
  });

  it("never marks pasted material gone: a paste is never the whole set", () => {
    const root = fixtureRoot("valid");
    const paste = {
      context: "a forum group",
      origin: "facebook",
      posted: null,
      rating: null,
      rating_scale: null,
      text: "recommended",
      url: null,
    };
    ingest(root, "alpha", { complete: true, records: [paste], source: "pasted" }, TODAY);
    const report = ingest(root, "alpha", { complete: true, records: [], source: "pasted" }, TODAY);
    expect(report.gone).toBe(0);
    expect(reviews(root, "pasted")[0]).toMatchObject({
      gone: null,
      origin: "facebook",
      source: "pasted",
    });
  });

  it("counts a review the collector returned twice once", () => {
    const root = fixtureRoot("valid");
    const report = ingest(
      root,
      "alpha",
      {
        complete: false,
        records: [review("b".repeat(24), "x"), review("b".repeat(24), "x")],
        source: "google",
      },
      TODAY,
    );
    expect(report.added).toBe(1);
  });

  it("rejects invalid input and writes nothing", () => {
    const root = fixtureRoot("valid");
    const file = path.join(root, RAW, "google.yaml");
    const before = readFileSync(file, "utf8");
    const bad = {
      complete: false,
      records: [{ ...review("c".repeat(24), "x"), rating: "high" }],
      source: "google",
    } as unknown as Collected;
    expect(() => ingest(root, "alpha", bad, TODAY)).toThrow(/rating/);
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("leaves data that passes check", () => {
    const root = fixtureRoot("valid");
    ingest(
      root,
      "alpha",
      { complete: true, records: [review("d".repeat(24), "new\n\nline")], source: "google" },
      TODAY,
    );
    expect(check(root)).toEqual([]);
  });
});

describe("ingest: site claims", () => {
  const PRICING = "https://alpha.example/pricing";
  const ABOUT = "https://alpha.example/about";

  it("leaves an identical claim unchanged and appends a new one", () => {
    const root = fixtureRoot("valid");
    const report = ingest(
      root,
      "alpha",
      {
        complete: true,
        records: [
          { kind: "price", text: "$400 per shared list", url: PRICING },
          { kind: "promise", text: "The simplest", url: PRICING },
        ],
        source: "site",
        urls: [PRICING],
      },
      TODAY,
    );
    expect(report).toMatchObject({ added: 1, superseded: 0, unchanged: 1 });
  });

  it("supersedes a claim no longer on a fully re-extracted page, by its one successor (C4)", () => {
    const root = fixtureRoot("valid");
    const report = ingest(
      root,
      "alpha",
      {
        complete: true,
        records: [{ kind: "price", text: "$450 per shared list", url: PRICING }],
        source: "site",
        urls: [PRICING],
      },
      TODAY,
    );
    expect(report.superseded).toBe(1);
    const all = claims(root);
    const successor = all.at(-1);
    expect(all.find((c) => c.id === "site-bbbbbbbbbb")?.superseded).toEqual({
      by: successor?.id,
      date: TODAY,
    });
    expect(check(root)).toEqual([]);
  });

  it("supersedes with by: null when there is no single successor of the same kind", () => {
    const root = fixtureRoot("valid");
    ingest(
      root,
      "alpha",
      {
        complete: true,
        records: [{ kind: "promise", text: "Price on request", url: PRICING }],
        source: "site",
        urls: [PRICING],
      },
      TODAY,
    );
    expect(claims(root).find((c) => c.id === "site-bbbbbbbbbb")?.superseded).toEqual({
      by: null,
      date: TODAY,
    });
  });

  it("leaves claims on pages not re-extracted this run alone (Review Focus 1)", () => {
    const root = fixtureRoot("valid");
    const report = ingest(
      root,
      "alpha",
      {
        complete: true,
        records: [{ kind: "promise", text: "About us", url: ABOUT }],
        source: "site",
        urls: [ABOUT],
      },
      TODAY,
    );
    expect(report.superseded).toBe(0);
    expect(claims(root).find((c) => c.id === "site-bbbbbbbbbb")?.superseded).toBeNull();
  });
});

describe("ingest: review follow-ups", () => {
  const PRICING = "https://alpha.example/pricing";

  it("supersedes no claim when the extraction was not complete (Review Focus 1)", () => {
    const root = fixtureRoot("valid");
    const report = ingest(
      root,
      "alpha",
      { complete: false, records: [], source: "site", urls: [PRICING] },
      TODAY,
    );
    expect(report.superseded).toBe(0);
  });

  it("keeps a claim that changes back current: 400, then 450, then 400 again", () => {
    const root = fixtureRoot("valid");
    const at = (text: string, today: string) =>
      ingest(
        root,
        "alpha",
        {
          complete: true,
          records: [{ kind: "price", text, url: PRICING }],
          source: "site",
          urls: [PRICING],
        },
        today,
      );
    at("$450 per shared list", "2026-10-05");
    const report = at("$400 per shared list", "2026-10-06");
    const active = claims(root).filter((claim) => claim.superseded === null);
    expect(active.map((claim) => claim.text)).toEqual(["$400 per shared list"]);
    expect(report).toMatchObject({ added: 1, superseded: 1 });
    expect(check(root)).toEqual([]);
  });

  it("refuses a slug that has no meta.yaml, and writes nothing", () => {
    const root = fixtureRoot("valid");
    expect(() =>
      ingest(root, "alphae", { complete: false, records: [], source: "google" }, TODAY),
    ).toThrow(/alphae.*meta\.yaml/);
  });

  it("names the record when one fails the schema", () => {
    const root = fixtureRoot("valid");
    const bad = {
      complete: false,
      records: [
        review("f".repeat(24), "x"),
        { ...review("a".repeat(24), "y"), flags: ["Not Kebab"] },
      ],
      source: "google",
    } as Collected;
    expect(() => ingest(root, "alpha", bad, TODAY)).toThrow(/records\.1\.flags/);
  });
});
