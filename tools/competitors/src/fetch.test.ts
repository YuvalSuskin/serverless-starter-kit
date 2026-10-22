import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

import type { Fetcher } from "./http.ts";

import { check } from "./check.ts";
import { fetchGoogle } from "./fetch.ts";
import { edit, fixtureRoot } from "./testing.ts";

it("collects the confirmed Google place into raw/, and reports searches used", async () => {
  const root = fixtureRoot("valid");
  edit(root, "docs/competitors/alpha/meta.yaml", (t) =>
    t.replace(
      "  google: null",
      '  google: { data_id: "0x0000000000000a01:0x0000000000000b01", place_id: null, url: null }',
    ),
  );
  const google = (name: string) =>
    readFileSync(path.join(import.meta.dirname, "fixtures/google", `${name}.json`), "utf8");
  const fetcher: Fetcher = (url) =>
    Promise.resolve({
      body: google(new URL(url).searchParams.has("next_page_token") ? "reviews-2" : "reviews-1"),
      status: 200,
    });
  const report = await fetchGoogle(root, "alpha", fetcher, "key", "2026-10-05");
  expect(report).toMatchObject({
    added: 5,
    collected: 5,
    complete: true,
    searchesUsed: 2,
    statedCount: 5,
  });
  expect(check(root)).toEqual([]);
});

it("asks in the market's language when told which", async () => {
  const root = fixtureRoot("valid");
  edit(root, "docs/competitors/alpha/meta.yaml", (t) =>
    t.replace(
      "  google: null",
      '  google: { data_id: "0x0000000000000a01:0x0000000000000b01", place_id: null, url: null }',
    ),
  );
  const asked: (string | null)[] = [];
  const fetcher: Fetcher = (url) => {
    asked.push(new URL(url).searchParams.get("hl"));
    return Promise.resolve({ body: '{"reviews":[],"search_information":{}}', status: 200 });
  };
  await fetchGoogle(root, "alpha", fetcher, "key", "2026-10-05", { hl: "fr" }).catch(
    () => undefined,
  );
  expect(asked[0]).toBe("fr");
});

it("refuses when no Google place is confirmed", async () => {
  await expect(
    fetchGoogle(
      fixtureRoot("valid"),
      "alpha",
      () => Promise.reject(new Error("no")),
      "key",
      "2026-10-05",
    ),
  ).rejects.toThrow(/no confirmed Google place/);
});
