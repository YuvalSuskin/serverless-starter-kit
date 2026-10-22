import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { check } from "./check.ts";
import { edit, fixtureRepo } from "./testing.ts";

const GOOGLE = "docs/competitors/alpha/raw/google.yaml";
const SITE = "docs/competitors/alpha/raw/site.yaml";

describe("check --against a git ref", () => {
  it("finds nothing when records were only appended", () => {
    const root = fixtureRepo("valid");
    edit(
      root,
      GOOGLE,
      (t) =>
        `${t}- id: google-${"e".repeat(24)}\n  source: google\n  url: null\n  posted: null\n  rating: null\n  rating_scale: null\n  text: new\n  fetched: 2026-10-05\n  gone: null\n`,
    );
    expect(check(root, { against: "HEAD" })).toEqual([]);
  });

  it.each([
    [
      "a deleted record",
      GOOGLE,
      (t: string) => t.replace(/- id: google-590e08da[\s\S]*$/, ""),
      /google-590e08da.*deleted/,
    ],
    [
      "edited text",
      GOOGLE,
      (t: string) => t.replace("worked partly", "worked well"),
      /google-694cfcb1.*text/,
    ],
    [
      "a changed gone date",
      GOOGLE,
      (t: string) => t.replace("gone: 2026-09-30", "gone: 2026-10-01"),
      /google-590e08da.*gone/,
    ],
    [
      "a cleared superseded",
      SITE,
      (t: string) =>
        t.replace("superseded: { date: 2026-09-29, by: site-bbbbbbbbbb }", "superseded: null"),
      /site-aaaaaaaaaa.*superseded/,
    ],
  ])("reports %s", (_name, file, change, message) => {
    const root = fixtureRepo("valid");
    edit(root, file, change);
    const problems = check(root, { against: "HEAD" });
    expect(problems.map((p) => p.message)).toEqual([expect.stringMatching(message)]);
    expect(problems[0]?.file).toBe(file);
  });

  it("reports an unknown ref", () => {
    expect(check(fixtureRepo("valid"), { against: "no-such-ref" })[0]?.message).toMatch(
      /no-such-ref/,
    );
  });
});

describe("check --against: review follow-ups", () => {
  it("handles a raw file larger than 1 MiB", () => {
    const root = fixtureRepo("valid");
    const big = "a very long line of review ".repeat(40);
    const records = Array.from(
      { length: 700 },
      (_, index) =>
        `- id: google-${index.toString(16).padStart(24, "0")}\n  source: google\n  url: null\n  posted: null\n  rating: null\n  rating_scale: null\n  text: ${big}\n  fetched: 2026-10-05\n  gone: null\n`,
    ).join("");
    edit(root, GOOGLE, (t) => t + records);
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qam", "big"], {
      cwd: root,
    });
    expect(check(root, { against: "HEAD" })).toEqual([]);
  });

  it("reports any other field of a record rewritten since the ref", () => {
    const root = fixtureRepo("valid");
    edit(root, GOOGLE, (t) => t.replace("rating: 40", "rating: 60"));
    expect(check(root, { against: "HEAD" }).map((p) => p.message)).toEqual([
      expect.stringMatching(/google-694cfcb1.*rating changed/),
    ]);
  });
});
