import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Fetcher } from "../http.ts";

import { CollectorBlocked } from "../http.ts";
import { collectGoogle, findGooglePlaces } from "./google.ts";

const KEY = "sk-test-0123456789";
const DATA_ID = "0x0000000000000a01:0x0000000000000b01";
const fixture = (name: string) =>
  readFileSync(path.join(import.meta.dirname, "../fixtures/google", `${name}.json`), "utf8");

/** Answers by what the request asks for; records each URL with the key blanked. */
function scripted(answer: (url: URL) => Error | { body: string; status: number }) {
  const calls: URL[] = [];
  const fetcher: Fetcher = (address) => {
    const url = new URL(address);
    calls.push(url);
    const result = answer(url);
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  };
  return { calls, fetcher };
}
const ok = (name: string) => ({ body: fixture(name), status: 200 });
const byPage = (pages: Record<string, Error | { body: string; status: number }>) => (url: URL) =>
  pages[url.searchParams.get("next_page_token") ?? "first"] ?? { body: "{}", status: 200 };

describe("collectGoogle", () => {
  it("asks SerpApi for the place's reviews, newest first, in English by default, then follows the page token", async () => {
    const { calls, fetcher } = scripted(
      byPage({ first: ok("reviews-1"), "TOKEN-2": ok("reviews-2") }),
    );
    await collectGoogle({ data_id: DATA_ID }, KEY, fetcher);
    expect(calls.map((url) => Object.fromEntries(url.searchParams))).toEqual([
      {
        api_key: KEY,
        data_id: DATA_ID,
        engine: "google_maps_reviews",
        hl: "en",
        sort_by: "newestFirst",
      },
      {
        api_key: KEY,
        data_id: DATA_ID,
        engine: "google_maps_reviews",
        hl: "en",
        next_page_token: "TOKEN-2",
        num: "20",
        sort_by: "newestFirst",
      },
    ]);
  });

  it("maps each review: source ID, link, date, rating out of 5, original text; no user", async () => {
    const { fetcher } = scripted(byPage({ first: ok("reviews-1"), "TOKEN-2": ok("reviews-2") }));
    const collected = await collectGoogle({ data_id: DATA_ID }, KEY, fetcher);
    expect(collected).toMatchObject({
      complete: true,
      searchesUsed: 2,
      source: "google",
      statedCount: 5,
    });
    expect(collected.records).toHaveLength(5);
    const first = (
      JSON.parse(fixture("reviews-1")) as {
        reviews: { extracted_snippet: { original: string }; link: string; review_id: string }[];
      }
    ).reviews[0];
    expect(collected.records[0]).toEqual({
      posted: "2025-10-12",
      rating: 5,
      rating_scale: 5,
      source_id: first?.review_id,
      text: first?.extracted_snippet.original,
      url: first?.link,
    });
    expect(JSON.stringify(collected)).not.toMatch(/"user"|contributor/);
  });

  it("keeps what it has and is not complete when a later page fails (Review Focus 1)", async () => {
    const { fetcher } = scripted(
      byPage({ first: ok("reviews-1"), "TOKEN-2": new TypeError("fetch failed") }),
    );
    const collected = await collectGoogle({ data_id: DATA_ID }, KEY, fetcher);
    expect(collected).toMatchObject({ complete: false });
    expect(collected.records).toHaveLength(3);
  });

  it("is not complete when the pages end short of the place's stated count", async () => {
    const { fetcher } = scripted(
      byPage({ first: ok("reviews-1"), "TOKEN-2": { body: '{"reviews":[]}', status: 200 } }),
    );
    expect((await collectGoogle({ data_id: DATA_ID }, KEY, fetcher)).complete).toBe(false);
  });

  it("stops at the cap on searches, incomplete, and says so", async () => {
    const pages = [ok("reviews-1"), ok("reviews-2")];
    let call = 0;
    const { calls, fetcher } = scripted(() => {
      const body = JSON.parse(pages[Math.min(call, 1)]?.body ?? "{}") as Record<string, unknown>;
      call += 1;
      return {
        body: JSON.stringify({
          ...body,
          reviews: [{ ...(body.reviews as object[])[0], review_id: `r${String(call)}` }],
          serpapi_pagination: { next_page_token: `T${String(call)}` },
        }),
        status: 200,
      };
    });
    const collected = await collectGoogle({ data_id: DATA_ID }, KEY, fetcher, { maxSearches: 2 });
    expect(calls).toHaveLength(2);
    expect(collected).toMatchObject({
      complete: false,
      searchesUsed: 2,
      stopped: "search cap (2) reached",
    });
  });

  it("says why it stopped: the end, a failed page, or a page with nothing new", async () => {
    const whole = scripted(byPage({ first: ok("reviews-1"), "TOKEN-2": ok("reviews-2") }));
    expect((await collectGoogle({ data_id: DATA_ID }, KEY, whole.fetcher)).stopped).toBe(
      "end of reviews",
    );
    const failed = scripted(
      byPage({ first: ok("reviews-1"), "TOKEN-2": new TypeError("fetch failed") }),
    );
    expect((await collectGoogle({ data_id: DATA_ID }, KEY, failed.fetcher)).stopped).toBe(
      "a later page failed: fetch failed",
    );
    const repeated = scripted(byPage({ first: ok("reviews-1"), "TOKEN-2": ok("reviews-1") }));
    const again = await collectGoogle({ data_id: DATA_ID }, KEY, repeated.fetcher);
    expect(again).toMatchObject({
      complete: false,
      searchesUsed: 2,
      stopped: "a page added no new review",
    });
  });

  it("stops on a first page it does not recognise, rather than calling nothing complete (Review Focus 1)", async () => {
    for (const body of ["{}", '{"place_info":{"reviews":5}}', '{"reviews":[]}']) {
      const { fetcher } = scripted(() => ({ body, status: 200 }));
      await expect(collectGoogle({ data_id: DATA_ID }, KEY, fetcher)).rejects.toThrow(/layout/);
    }
  });

  it("stops on a review with no ID, a layout it does not know", async () => {
    const page = JSON.parse(fixture("reviews-1")) as { reviews: Record<string, unknown>[] };
    delete page.reviews[1]?.review_id;
    const { fetcher } = scripted(() => ({ body: JSON.stringify(page), status: 200 }));
    await expect(collectGoogle({ data_id: DATA_ID }, KEY, fetcher)).rejects.toThrow(/layout/);
  });

  it("fails on SerpApi's error, and never shows the key", async () => {
    const { fetcher } = scripted(() => ({ body: fixture("error"), status: 200 }));
    const failure = collectGoogle({ data_id: DATA_ID }, KEY, fetcher);
    await expect(failure).rejects.toThrow(/hasn't returned any results/);
    const withKey = scripted(() => ({ body: `{"error":"Bad key ${KEY}"}`, status: 200 }));
    await expect(collectGoogle({ data_id: DATA_ID }, KEY, withKey.fetcher)).rejects.toThrow(
      "Bad key [key]",
    );
    await expect(failure).rejects.not.toThrow(KEY);
    const refused = scripted(() => ({
      body: `{"error":"Invalid API key. Your API key should be here: ${KEY}"}`,
      status: 401,
    }));
    await expect(collectGoogle({ data_id: DATA_ID }, KEY, refused.fetcher)).rejects.not.toThrow(
      KEY,
    );
  });

  it("stops on a block", async () => {
    const { fetcher } = scripted(() => new CollectorBlocked("google", "HTTP 429"));
    await expect(collectGoogle({ data_id: DATA_ID }, KEY, fetcher)).rejects.toThrow(
      CollectorBlocked,
    );
  });
});

describe("the market's language and country", () => {
  it("asks for the reviews in the language it is given", async () => {
    const { calls, fetcher } = scripted(
      byPage({ first: ok("reviews-1"), "TOKEN-2": ok("reviews-2") }),
    );
    await collectGoogle({ data_id: DATA_ID }, KEY, fetcher, { hl: "fr" });
    expect(calls.map((url) => url.searchParams.get("hl"))).toEqual(["fr", "fr"]);
  });

  it("looks for places in the country and language it is given", async () => {
    const { calls, fetcher } = scripted(() => ok("find"));
    await findGooglePlaces("Alpha App", KEY, fetcher, { gl: "fr", hl: "fr" });
    expect(Object.fromEntries(calls[0]?.searchParams ?? [])).toMatchObject({ gl: "fr", hl: "fr" });
  });
});

describe("findGooglePlaces", () => {
  it("lists candidate places with what is needed to confirm them, in one search", async () => {
    const { calls, fetcher } = scripted(() => ok("find"));
    const places = await findGooglePlaces("Alpha App", KEY, fetcher);
    expect(Object.fromEntries(calls[0]?.searchParams ?? [])).toMatchObject({
      engine: "google_maps",
      gl: "us",
      hl: "en",
      q: "Alpha App",
      type: "search",
    });
    expect(places[0]).toMatchObject({
      data_id: DATA_ID,
      reviews: 29,
      title: "Example Co",
      website: "https://example-co.example/",
    });
    expect(places).toHaveLength(4);
  });
});
