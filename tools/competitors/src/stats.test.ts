import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { stats } from "./stats.ts";
import { edit, fixtureRoot } from "./testing.ts";

const AS_OF = "2026-10-05";

/** The valid fixture's alpha, plus beta (two reviews) and gamma (identified, nothing collected). */
function landscape(): string {
  const root = fixtureRoot("valid");
  const dir = (slug: string) => path.join(root, "docs/competitors", slug);
  const meta = (slug: string) =>
    `name: ${slug}\nslug: ${slug}\naliases: []\ndomains: []\nconfirmed: 2026-09-29\nlistings: {}\n`;
  for (const slug of ["beta", "gamma"]) {
    mkdirSync(path.join(dir(slug), "raw"), { recursive: true });
    writeFileSync(path.join(dir(slug), "meta.yaml"), meta(slug));
  }
  const review = (id: string, posted: string) =>
    `- id: google-${id}\n  source: google\n  url: null\n  posted: ${posted}\n  rating: 20\n  rating_scale: 100\n  text: text\n  fetched: 2026-09-29\n  gone: null\n`;
  writeFileSync(
    path.join(dir("beta"), "raw/google.yaml"),
    review("b1", "2026-09-01") + review("b2", "2024-01-01"),
  );
  const insight = (ref: string, mentions: string) =>
    `- ref: google-${ref}\n  persona: buyer\n  summary_en: x\n  mentions: [${mentions}]\n  tagged: 2026-09-29\n`;
  writeFileSync(
    path.join(dir("beta"), "insights.yaml"),
    insight(
      "b1",
      "{ feature: price, sentiment: negative, kind: pain }, { feature: contributions, sentiment: negative, kind: missing }",
    ) +
      insight(
        "b2",
        "{ feature: price, sentiment: negative, kind: pain }, { feature: auto-tag, sentiment: positive, kind: praise }",
      ),
  );
  return root;
}

const section = (output: string, heading: string) => {
  const start = output.indexOf(`### ${heading}\n`);
  expect(start, `### ${heading}`).toBeGreaterThanOrEqual(0);
  const rest = output.slice(start + heading.length + 5);
  return rest.slice(0, rest.search(/\n### |$/));
};

describe("stats for one competitor", () => {
  const output = stats(fixtureRoot("valid"), { asOf: AS_OF, slug: "alpha" });

  it("prints its sections in a fixed order", () => {
    const headings = [...output.matchAll(/^### (.+)$/gm)].map((match) => match[1]);
    expect(headings).toEqual([
      "Evidence",
      "Personas",
      "Features",
      "Praise",
      "Pain",
      "Missing",
      "Prices",
    ]);
  });

  it("counts evidence, with the latest review and the last 12 months, leaving gone records out", () => {
    const evidence = section(output, "Evidence");
    expect(evidence).toContain("| google | 1 | 1 | 2025-12-25 | 2025-12-25 |");
    expect(evidence).toContain("Latest review: 2025-12-25");
    expect(evidence).toContain("Reviews in the 12 months to 2026-10-05: 1");
    expect(evidence).toContain("Site claims: 1 current, 1 superseded");
    expect(evidence).toContain("Tagged: 2 of 4 records");
  });

  it("splits reviewers by persona, with what the site claims and the Acme actor", () => {
    expect(section(output, "Personas")).toContain("| buyer | 1 | yes | none |");
  });

  it("tabulates each feature: claimed, reviews, sentiment, glossary term; most reviewed first", () => {
    const rows = section(output, "Features")
      .split("\n")
      .filter(
        (line) =>
          line.startsWith("| ") && !line.startsWith("| Feature") && !line.startsWith("| ---"),
      );
    expect(rows).toEqual([
      "| auto-tag | Auto tag | content | no | 1 | 0 | 0 | 1 | 0 | — |",
      "| price | Price | aspect | no | 1 | 0 | 1 | 0 | 0 | — |",
      "| contributions | Shared list | content | yes | 0 | 0 | 0 | 0 | 0 | shared-list |",
    ]);
  });

  it("ranks pain by count, then recency, then ID, citing the raw records", () => {
    expect(section(output, "Pain").trim().split("\n")).toEqual([
      "- auto-tag (Auto tag): 1 review, latest 2025-12-25 — google-694cfcb1eeee0d9b184fad86",
      "- price (Price): 1 review, latest 2025-12-25 — google-694cfcb1eeee0d9b184fad86",
    ]);
    expect(section(output, "Praise").trim()).toBe("none");
  });

  it("lists current prices, and earlier ones with the dates they held", () => {
    expect(section(output, "Prices").trim().split("\n")).toEqual([
      "- Current: $400 per shared list (https://alpha.example/pricing, since 2026-09-29; site-bbbbbbbbbb)",
      "- Earlier: $350 per shared list (https://alpha.example/pricing, 2026-09-01 to 2026-09-29; site-aaaaaaaaaa)",
    ]);
  });

  it("prints every heading with 'none' for a competitor with nothing collected yet", () => {
    const empty = stats(landscape(), { asOf: AS_OF, slug: "gamma" });
    expect(section(empty, "Evidence")).toContain("Latest review: none");
    for (const heading of ["Personas", "Features", "Praise", "Pain", "Missing", "Prices"]) {
      expect(section(empty, heading).trim()).toBe("none");
    }
  });

  it("marks a finding that rests only on pasted material", () => {
    const root = fixtureRoot("valid");
    const alpha = path.join(root, "docs/competitors/alpha");
    writeFileSync(
      path.join(alpha, "raw/pasted.yaml"),
      "- id: pasted-0123456789\n  source: pasted\n  url: null\n  posted: 2026-09-20\n  rating: null\n  rating_scale: null\n  text: missing\n  origin: facebook\n  fetched: 2026-09-29\n  gone: null\n",
    );
    writeFileSync(
      path.join(alpha, "insights.yaml"),
      "- ref: pasted-0123456789\n  persona: null\n  summary_en: x\n  mentions: [{ feature: contributions, sentiment: negative, kind: missing }]\n  tagged: 2026-09-29\n",
    );
    expect(section(stats(root, { asOf: AS_OF, slug: "alpha" }), "Missing")).toContain(
      "— pasted-0123456789 (pasted only)",
    );
  });
});

describe("stats for every competitor", () => {
  const output = stats(landscape(), { asOf: AS_OF });

  it("prints the landscape's sections in a fixed order", () => {
    expect([...output.matchAll(/^### (.+)$/gm)].map((match) => match[1])).toEqual([
      "Relevance",
      "Features",
      "Persona coverage",
    ]);
  });

  it("orders relevance by latest review, newest first, with never-reviewed last", () => {
    const rows = section(output, "Relevance")
      .split("\n")
      .filter((line) => /^\| (alpha|beta|gamma) /.test(line));
    expect(rows).toEqual([
      "| beta | 2026-09-01 | 1 | 2 |",
      "| alpha | 2025-12-25 | 1 | 1 |",
      "| gamma | none | 0 | 0 |",
    ]);
  });

  it("is a lookup: per feature, by stage, a row per competitor with evidence, counting reviews by sentiment and missing", () => {
    const lines = section(output, "Features")
      .trim()
      .split("\n")
      .filter((line) => line.startsWith("#### ") || /^\| (alpha|beta|gamma) /.test(line));
    expect(lines).toEqual([
      "#### content · auto-tag (Auto tag)",
      "| alpha | no | 0 | 0 | 1 | 0 |",
      "| beta | no | 1 | 0 | 0 | 0 |",
      "#### content · contributions (Shared list)",
      "| alpha | yes | 0 | 0 | 0 | 0 |",
      "| beta | no | 0 | 0 | 0 | 1 |",
      "#### aspect · price (Price)",
      "| alpha | no | 0 | 1 | 0 | 0 |",
      "| beta | no | 0 | 2 | 0 | 0 |",
    ]);
    expect(section(output, "Features")).toContain(
      "| Competitor | Claimed on site | Positive | Negative | Mixed | Missing |",
    );
  });

  it("counts a review once per sentiment, and keeps missing apart from sentiment (C23)", () => {
    const root = landscape();
    const beta = path.join(root, "docs/competitors/beta/insights.yaml");
    writeFileSync(
      beta,
      "- ref: google-b1\n  persona: buyer\n  summary_en: x\n  mentions: [{ feature: price, sentiment: negative, kind: pain }, { feature: price, sentiment: negative, kind: pain }, { feature: price, sentiment: negative, kind: missing }]\n  tagged: 2026-09-29\n",
    );
    expect(section(stats(root, { asOf: AS_OF }), "Features")).toContain(
      "| beta | no | 0 | 1 | 0 | 1 |",
    );
  });

  it("shows persona coverage, and personas Acme has no actor for", () => {
    expect(section(output, "Persona coverage")).toContain(
      "| buyer | none | claimed, 1 review | 2 reviews | — |",
    );
  });
});

describe("stats: the landscape's stages", () => {
  it("come in the order the taxonomy first names them, aspects last", () => {
    const root = landscape();
    const features = (stage: string, id: string) =>
      `- id: ${id}\n  name: ${id}\n  type: feature\n  stage: ${stage}\n  glossary: null\n  aliases: []\n  withdrawn: null\n`;
    writeFileSync(
      path.join(root, "docs/competitors/taxonomy/features.yaml"),
      features("setup", "contributions") +
        features("sharing", "auto-tag") +
        "- id: price\n  name: Price\n  type: aspect\n  stage: aspect\n  glossary: null\n  aliases: []\n  withdrawn: null\n",
    );
    const headings = stats(root, { asOf: AS_OF })
      .split("\n")
      .filter((line) => line.startsWith("#### "));
    expect(headings).toEqual([
      "#### setup · contributions (contributions)",
      "#### sharing · auto-tag (auto-tag)",
      "#### aspect · price (Price)",
    ]);
  });
});

describe("stats: review follow-ups", () => {
  /** A fixture root with one competitor holding exactly these reviews and insights. */
  function world(
    reviews: string[],
    insights: string[],
    others: Record<string, [string[], string[]]> = {},
  ): string {
    const root = fixtureRoot("valid");
    const write = (slug: string, raw: string[], tagged: string[]) => {
      const dir = path.join(root, "docs/competitors", slug);
      mkdirSync(path.join(dir, "raw"), { recursive: true });
      writeFileSync(
        path.join(dir, "meta.yaml"),
        `name: ${slug}\nslug: ${slug}\naliases: []\ndomains: []\nconfirmed: 2026-09-29\nlistings: {}\n`,
      );
      writeFileSync(path.join(dir, "raw/google.yaml"), raw.join(""));
      writeFileSync(path.join(dir, "insights.yaml"), tagged.join(""));
    };
    write("delta", reviews, insights);
    for (const [slug, [raw, tagged]] of Object.entries(others)) write(slug, raw, tagged);
    return root;
  }
  const rev = (id: string, posted: string, gone = "null", source = "google") =>
    `- id: ${source}-${id}\n  source: ${source}\n  url: null\n  posted: ${posted}\n  rating: null\n  rating_scale: null\n  text: t\n${source === "pasted" ? "  origin: facebook\n" : ""}  fetched: 2026-09-29\n  gone: ${gone === "null" ? "null" : gone}\n`;
  const tag = (ref: string, mentions: string) =>
    `- ref: ${ref}\n  persona: null\n  summary_en: x\n  mentions: [${mentions}]\n  tagged: 2026-09-29\n`;
  const m = (feature: string, sentiment: string, kind: string) =>
    `{ feature: ${feature}, sentiment: ${sentiment}, kind: ${kind} }`;

  it("leaves a gone review out of the latest date, even when it is newer", () => {
    const root = world([rev("a", "2025-01-01"), rev("b", "2026-09-01", "2026-09-29")], []);
    expect(section(stats(root, { asOf: AS_OF, slug: "delta" }), "Evidence")).toContain(
      "Latest review: 2025-01-01",
    );
  });

  it("counts the 12 months from the same day a year before, through the as-of day, both included", () => {
    const root = world(
      [
        rev("a", "2025-10-04"),
        rev("b", "2025-10-05"),
        rev("c", "2026-10-05"),
        rev("d", "2026-10-06"),
      ],
      [],
    );
    const evidence = section(stats(root, { asOf: AS_OF, slug: "delta" }), "Evidence");
    expect(evidence).toContain("Reviews in the 12 months to 2026-10-05: 2");
    expect(evidence).toContain("Latest review: 2026-10-05");
  });

  it("breaks a tie in count by the most recent review", () => {
    const root = world(
      [rev("old", "2024-01-01"), rev("new", "2026-01-01")],
      [
        tag("google-old", m("auto-tag", "negative", "pain")),
        tag("google-new", m("price", "negative", "pain")),
      ],
    );
    const pain = section(stats(root, { asOf: AS_OF, slug: "delta" }), "Pain")
      .trim()
      .split("\n");
    expect(pain.map((line) => line.split(" ")[1])).toEqual(["price", "auto-tag"]);
  });

  it("marks a finding pasted only when every review behind it is pasted, not some", () => {
    const root = world(
      [rev("a", "2026-01-01")],
      [
        tag("google-a", m("price", "negative", "pain")),
        tag("pasted-0123456789", m("price", "negative", "pain")),
      ],
    );
    writeFileSync(
      path.join(root, "docs/competitors/delta/raw/pasted.yaml"),
      rev("0123456789", "2026-01-02", "null", "pasted"),
    );
    expect(section(stats(root, { asOf: AS_OF, slug: "delta" }), "Pain")).not.toContain(
      "(pasted only)",
    );
  });

  it("refuses an as-of that is not a real date, and a slug with no folder", () => {
    expect(() => stats(fixtureRoot("valid"), { asOf: "2026-9-5", slug: "alpha" })).toThrow(/as-of/);
    expect(() => stats(fixtureRoot("valid"), { asOf: "2026-02-31", slug: "alpha" })).toThrow(
      /as-of/,
    );
    expect(() => stats(fixtureRoot("valid"), { asOf: AS_OF, slug: "nosuch" })).toThrow(/nosuch/);
  });

  it("keeps a multi-line price and a pipe from breaking the Markdown", () => {
    const root = fixtureRoot("valid");
    edit(root, "docs/competitors/alpha/raw/site.yaml", (t) =>
      t.replace("text: $400 per shared list", () => 'text: "$400 | package\\nincludes a screen"'),
    );
    const prices = section(stats(root, { asOf: AS_OF, slug: "alpha" }), "Prices");
    expect(prices).toContain("- Current: $400 | package / includes a screen (");
  });

  it("says when the evidence was last collected", () => {
    expect(
      section(stats(fixtureRoot("valid"), { asOf: AS_OF, slug: "alpha" }), "Evidence"),
    ).toContain("Last collected: 2026-09-29");
  });

  it("matches the full output it had when reviewed (a lock on the layout templates rely on)", () => {
    expect(stats(fixtureRoot("valid"), { asOf: AS_OF, slug: "alpha" })).toMatchSnapshot();
    expect(stats(landscape(), { asOf: AS_OF })).toMatchSnapshot();
  });
});

describe("stats: final review follow-ups", () => {
  it("does not count a testimonial on the site as the company claiming a feature or persona", () => {
    const root = fixtureRoot("valid");
    const alpha = path.join(root, "docs/competitors/alpha");
    edit(
      root,
      "docs/competitors/alpha/raw/site.yaml",
      (t) =>
        `${t}- id: site-cccccccccc\n  url: https://alpha.example/pricing\n  kind: testimonial\n  text: Transparent and accurate\n  fetched: 2026-09-29\n  superseded: null\n`,
    );
    writeFileSync(
      path.join(alpha, "insights.yaml"),
      "- ref: site-cccccccccc\n  persona: partner\n  summary_en: x\n  mentions: [{ feature: auto-tag, sentiment: neutral, kind: claim }]\n  tagged: 2026-09-29\n",
    );
    const output = stats(root, { asOf: AS_OF });
    expect(section(output, "Features")).not.toContain("auto-tag");
    expect(section(output, "Persona coverage")).toContain("| partner | partner | — |");
  });
});
