import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { check } from "./check.ts";
import { edit, fixtureRoot } from "./testing.ts";

const ALPHA = "docs/competitors/alpha";
const TAXONOMY = "docs/competitors/taxonomy";

/** A fresh copy of the valid fixture with one file rewritten. */
function broken(file: string, change: (text: string) => string): string {
  const root = fixtureRoot("valid");
  edit(root, file, change);
  return root;
}

function only(root: string) {
  const problems = check(root);
  expect(problems).toHaveLength(1);
  return problems[0];
}

describe("check", () => {
  it("finds nothing wrong with the valid fixture", () => {
    expect(check(fixtureRoot("valid"))).toEqual([]);
  });

  it("finds nothing to check before docs/competitors/ exists", () => {
    const root = fixtureRoot("valid");
    rmSync(path.join(root, "docs/competitors"), { recursive: true });
    expect(check(root)).toEqual([]);
  });

  describe("schemas", () => {
    it.each([
      [`${ALPHA}/raw/google.yaml`, "rating: 40", "rating: forty", /google-694cfcb1.*rating/],
      [
        `${ALPHA}/raw/site.yaml`,
        "kind: price\n  text: $400",
        "kind: brochure\n  text: $400",
        /site-bbbbbbbbbb.*kind/,
      ],
      [
        `${ALPHA}/insights.yaml`,
        "sentiment: mixed",
        "sentiment: angry",
        /google-694cfcb1.*sentiment/,
      ],
      [`${ALPHA}/meta.yaml`, "name: Alpha\n", "", /name/],
      [`${TAXONOMY}/features.yaml`, "type: aspect", "type: quality", /price.*type/],
      [`${TAXONOMY}/personas.yaml`, "aliases: [client]", "aliases: client", /buyer.*aliases/],
    ])("reports a schema violation in %s", (file, from, to, message) => {
      const problem = only(broken(file, (text) => text.replace(from, to)));
      expect(problem?.file).toBe(file);
      expect(problem?.message).toMatch(message);
    });

    it("reports a rating above its scale", () => {
      const problem = only(
        broken(`${ALPHA}/raw/google.yaml`, (t) => t.replace("rating: 40", "rating: 140")),
      );
      expect(problem?.message).toMatch(/rating/);
    });

    it("reports pasted material without its origin", () => {
      const root = fixtureRoot("valid");
      writeFileSync(
        path.join(root, ALPHA, "raw/pasted.yaml"),
        "- id: pasted-0123456789\n  source: pasted\n  url: null\n  posted: null\n  rating: null\n  rating_scale: null\n  text: text\n  fetched: 2026-09-29\n  gone: null\n",
      );
      expect(only(root)?.message).toMatch(/pasted-0123456789.*origin/);
    });

    it("reports a file that does not parse as YAML", () => {
      const problem = only(broken(`${ALPHA}/insights.yaml`, (t) => `${t}\n  - : [\n`));
      expect(problem?.file).toBe(`${ALPHA}/insights.yaml`);
    });
  });

  describe("raw records", () => {
    it("reports a duplicate ID", () => {
      const root = broken(
        `${ALPHA}/raw/site.yaml`,
        (t) =>
          `${t}- id: site-aaaaaaaaaa\n  url: https://alpha.example/x\n  kind: promise\n  text: again\n  fetched: 2026-09-29\n  superseded: null\n`,
      );
      expect(only(root)?.message).toMatch(/site-aaaaaaaaaa.*duplicate/i);
    });

    it("reports a raw file for a source not on the closed list", () => {
      const root = fixtureRoot("valid");
      renameSync(
        path.join(root, ALPHA, "raw/google.yaml"),
        path.join(root, ALPHA, "raw/wedreviews.yaml"),
      );
      edit(root, `${ALPHA}/insights.yaml`, (t) =>
        t.replace(/- ref: google-694cfcb1[\s\S]*?(?=- ref: site)/, ""),
      );
      expect(only(root)?.message).toMatch(/wedreviews/);
    });

    it("reports a record whose source differs from its file", () => {
      const problem = only(
        broken(`${ALPHA}/raw/google.yaml`, (t) =>
          t.replace(
            "source: google\n  url: null",
            "source: pasted\n  origin: a forum thread\n  url: null",
          ),
        ),
      );
      expect(problem?.message).toMatch(/google-590e08da.*source/);
    });

    it("reports an ID that does not start with its source", () => {
      const problem = only(
        broken(`${ALPHA}/raw/google.yaml`, (t) =>
          t.replace("id: google-590e08da", "id: pasted-590e08da"),
        ),
      );
      expect(problem?.message).toMatch(/pasted-590e08da/);
    });

    it("reports gone before fetched", () => {
      const problem = only(
        broken(`${ALPHA}/raw/google.yaml`, (t) =>
          t.replace("gone: 2026-09-30", "gone: 2026-09-01"),
        ),
      );
      expect(problem?.message).toMatch(/google-590e08da.*gone/);
    });

    it("reports superseded.by naming a claim that does not exist", () => {
      const problem = only(
        broken(`${ALPHA}/raw/site.yaml`, (t) =>
          t.replace("by: site-bbbbbbbbbb", "by: site-cccccccccc"),
        ),
      );
      expect(problem?.message).toMatch(/site-aaaaaaaaaa.*site-cccccccccc/);
    });
  });

  describe("insights", () => {
    it("reports a ref that resolves to no raw record", () => {
      const problem = only(
        broken(`${ALPHA}/insights.yaml`, (t) =>
          t.replace("ref: site-bbbbbbbbbb", "ref: site-zzzzzzzzzz"),
        ),
      );
      expect(problem?.message).toMatch(/site-zzzzzzzzzz/);
    });

    it("reports two insights for one record", () => {
      const problem = only(
        broken(`${ALPHA}/insights.yaml`, (t) =>
          t.replace("ref: site-bbbbbbbbbb", "ref: google-694cfcb1eeee0d9b184fad86"),
        ),
      );
      expect(problem?.message).toMatch(/google-694cfcb1.*more than one/);
    });

    it("reports an unknown feature", () => {
      const problem = only(
        broken(`${ALPHA}/insights.yaml`, (t) => t.replace("feature: price", "feature: rsvp-calls")),
      );
      expect(problem?.message).toMatch(/rsvp-calls/);
    });

    it("reports an unknown persona", () => {
      const problem = only(
        broken(`${ALPHA}/insights.yaml`, (t) =>
          t.replace('persona: buyer\n  summary_en: "Too', 'persona: reseller\n  summary_en: "Too'),
        ),
      );
      expect(problem?.message).toMatch(/reseller/);
    });

    it("reports a withdrawn term still in use, with the ref and its replacement", () => {
      const problem = only(
        broken(`${ALPHA}/insights.yaml`, (t) =>
          t.replace("feature: auto-tag", "feature: old-search"),
        ),
      );
      expect(problem?.file).toBe(`${ALPHA}/insights.yaml`);
      expect(problem?.message).toMatch(/google-694cfcb1eeee0d9b184fad86/);
      expect(problem?.message).toMatch(/old-search/);
      expect(problem?.message).toMatch(/auto-tag/);
    });
  });

  describe("taxonomy", () => {
    it("reports a glossary link to no glossary term", () => {
      const problem = only(
        broken(`${TAXONOMY}/features.yaml`, (t) =>
          t.replace("glossary: shared-list", "glossary: item-wall"),
        ),
      );
      expect(problem?.message).toMatch(/contributions.*item-wall/);
    });

    it("reports a glossary link to a withdrawn term", () => {
      const problem = only(
        broken(`${TAXONOMY}/features.yaml`, (t) =>
          t.replace("glossary: shared-list", "glossary: story"),
        ),
      );
      expect(problem?.message).toMatch(/story/);
    });

    it("reports an actor link to no actor", () => {
      const problem = only(
        broken(`${TAXONOMY}/personas.yaml`, (t) => t.replace("actor: partner", "actor: reviewer")),
      );
      expect(problem?.message).toMatch(/reviewer/);
    });

    it("reports replaced_by naming no term", () => {
      const problem = only(
        broken(`${TAXONOMY}/features.yaml`, (t) =>
          t.replace("replaced_by: auto-tag", "replaced_by: keyword-match"),
        ),
      );
      expect(problem?.message).toMatch(/keyword-match/);
    });
  });

  it("reports a meta.yaml whose slug is not its folder", () => {
    const problem = only(
      broken(`${ALPHA}/meta.yaml`, (t) => t.replace("slug: alpha", "slug: alpha-inc")),
    );
    expect(problem?.message).toMatch(/alpha-inc/);
  });

  it("checks one competitor when given its slug, and the taxonomy always", () => {
    const root = broken(`${ALPHA}/meta.yaml`, (t) => t.replace("slug: alpha", "slug: other"));
    expect(check(fixtureRoot("valid"), { slug: "alpha" })).toEqual([]);
    expect(check(root, { slug: "alpha" })).toHaveLength(1);
  });
});

describe("pnpm competitors check", () => {
  const cli = path.join(import.meta.dirname, "cli.ts");
  const run = (root: string) => {
    try {
      return {
        code: 0,
        out: execFileSync(process.execPath, [cli, "check", "--root", root], { encoding: "utf8" }),
      };
    } catch (error) {
      const failed = error as { status: number; stdout: string };
      return { code: failed.status, out: failed.stdout };
    }
  };

  it("exits 0 and prints nothing for valid data", () => {
    expect(run(fixtureRoot("valid"))).toEqual({ code: 0, out: "" });
  });

  it("exits 1 and prints file: message lines for invalid data", () => {
    const result = run(
      broken(`${ALPHA}/insights.yaml`, (t) => t.replace("feature: price", "feature: rsvp-calls")),
    );
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/^docs\/competitors\/alpha\/insights\.yaml: .*rsvp-calls/m);
  });
});

describe("check: rules added after review", () => {
  it("reports a slug with no competitor folder, so a typo is not a false green", () => {
    expect(check(fixtureRoot("valid"), { slug: "alphae" })).toEqual([
      { file: "docs/competitors/alphae", message: "no competitor has this slug" },
    ]);
  });

  it.each([
    [`${ALPHA}/raw/site.yml`, /site\.yml/],
    [`${ALPHA}/notes.txt`, /notes\.txt/],
  ])("reports an unexpected file: %s", (file, message) => {
    const root = fixtureRoot("valid");
    writeFileSync(path.join(root, file), "x\n");
    expect(only(root)?.message).toMatch(message);
  });

  it("accepts a walkthrough: flows.md and screenshots under screens/", () => {
    const root = fixtureRoot("valid");
    mkdirSync(path.join(root, ALPHA, "walkthrough/screens"), { recursive: true });
    writeFileSync(path.join(root, ALPHA, "walkthrough/flows.md"), "# Flows\n");
    writeFileSync(path.join(root, ALPHA, "walkthrough/screens/01-dashboard.webp"), "x");
    expect(check(root)).toEqual([]);
  });

  it.each([
    [`${ALPHA}/walkthrough/notes.txt`, /notes\.txt/],
    [`${ALPHA}/walkthrough/screens/01-dashboard.gif`, /01-dashboard\.gif/],
  ])("reports an unexpected walkthrough file: %s", (file, message) => {
    const root = fixtureRoot("valid");
    mkdirSync(path.join(root, ALPHA, "walkthrough/screens"), { recursive: true });
    writeFileSync(path.join(root, file), "x\n");
    expect(only(root)?.message).toMatch(message);
  });

  it("reports a broken product doc once, with a relative path, and no cascade", () => {
    const root = broken("docs/product/shared/actors.md", () => "# Actors\n");
    const problem = only(root);
    expect(problem?.file).toBe("docs/product/shared/actors.md");
    expect(problem?.message).not.toContain(root);
  });

  it("reports a missing or empty taxonomy", () => {
    const root = broken(`${TAXONOMY}/personas.yaml`, () => "[]\n");
    edit(root, `${ALPHA}/insights.yaml`, (t) => t.replaceAll("persona: buyer", "persona: null"));
    expect(only(root)?.message).toMatch(/no personas/);
  });

  it.each([
    ["itself", "replaced_by: auto-tag", "replaced_by: old-search"],
    [
      "a withdrawn term",
      "  aliases: [semantic search]\n  withdrawn: null",
      "  aliases: [semantic search]\n  withdrawn: { date: 2026-09-29, reason: gone, replaced_by: null }",
    ],
  ])("reports replaced_by naming %s", (_name, from, to) => {
    const root = broken(`${TAXONOMY}/features.yaml`, (t) => t.replace(from, to));
    if (from.startsWith("  aliases"))
      edit(root, `${ALPHA}/insights.yaml`, (t) => t.replace("feature: auto-tag", "feature: price"));
    expect(only(root)?.message).toMatch(/old-search.*replaced_by/);
  });

  it("reports superseded before fetched", () => {
    const problem = only(
      broken(`${ALPHA}/raw/site.yaml`, (t) =>
        t.replace("date: 2026-09-29, by", "date: 2026-08-01, by"),
      ),
    );
    expect(problem?.message).toMatch(/site-aaaaaaaaaa.*superseded/);
  });

  it.each([
    ["an impossible date", "posted: 2025-12-25", "posted: 2025-02-31", /posted/],
    [
      "a non-web URL",
      "url: https://reviews.example/reviews/694cfcb1eeee0d9b184fad86",
      "url: javascript:alert(1)",
      /url/,
    ],
    [
      "origin on a non-pasted review",
      "  flags: [verified]",
      "  flags: [verified]\n  origin: facebook",
      /origin/,
    ],
  ])("reports %s", (_name, from, to, message) => {
    expect(only(broken(`${ALPHA}/raw/google.yaml`, (t) => t.replace(from, to)))?.message).toMatch(
      message,
    );
  });
});
