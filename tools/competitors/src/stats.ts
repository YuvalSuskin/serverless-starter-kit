// `pnpm competitors stats`: every number and table tier 3
// shows, as Markdown under fixed `###` headings the skill's templates name.
// The model writes prose around these; it never counts.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import * as z from "zod";

import { competitorsDir, readYamlList } from "./files.ts";
import { ClaimRecord, Feature, InsightEntry, Persona, ReviewRecord, SOURCES } from "./schema.ts";

type Kind = InsightEntry["mentions"][number]["kind"];
type Sentiment = InsightEntry["mentions"][number]["sentiment"];

const isoDate = z.iso.date();
const SENTIMENTS: Sentiment[] = ["positive", "negative", "mixed", "neutral"];

interface Competitor {
  claims: ClaimRecord[];
  insights: InsightEntry[];
  reviews: ReviewRecord[];
  slug: string;
}

interface Taxonomy {
  features: Map<string, Feature>;
  personas: Map<string, Persona>;
}

function load(root: string, slug: string): Competitor {
  const folder = path.join(competitorsDir(root), slug);
  const reviews = SOURCES.flatMap((source) =>
    readYamlList(path.join(folder, "raw", `${source}.yaml`), ReviewRecord),
  );
  return {
    claims: readYamlList(path.join(folder, "raw", "site.yaml"), ClaimRecord),
    insights: readYamlList(path.join(folder, "insights.yaml"), InsightEntry),
    reviews,
    slug,
  };
}

function loadTaxonomy(root: string): Taxonomy {
  const dir = path.join(competitorsDir(root), "taxonomy");
  return {
    features: new Map(readYamlList(path.join(dir, "features.yaml"), Feature).map((f) => [f.id, f])),
    personas: new Map(readYamlList(path.join(dir, "personas.yaml"), Persona).map((p) => [p.id, p])),
  };
}

/** Text on one Markdown line: line breaks become " / ". */
const oneLine = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" / ");
const cell = (value: string) => oneLine(value).replaceAll("|", "\\|");
const table = (header: string[], rows: string[][]) =>
  [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n");
const orNone = (lines: string[]) => (lines.length === 0 ? "none" : lines.join("\n"));
const plural = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? "" : "s"}`;
const latest = (dates: (null | string)[]) =>
  dates
    .filter((d): d is string => d !== null)
    .sort((a, b) => a.localeCompare(b))
    .at(-1);

/** The first day of the 12 months that end on `asOf`, inclusive. */
function yearBefore(asOf: string): string {
  const [year = "0", rest = ""] = asOf.split(/-(.*)/s);
  return `${String(Number(year) - 1)}-${rest}`;
}

/** Reviews still on their source; gone ones are counted apart, never in current figures. */
const current = (competitor: Competitor) =>
  competitor.reviews.filter((review) => review.gone === null);

interface Relevance {
  lastYear: number;
  latest: string | undefined;
  total: number;
}

function relevance(competitor: Competitor, asOf: string): Relevance {
  const reviews = current(competitor);
  const start = yearBefore(asOf);
  return {
    lastYear: reviews.filter((r) => r.posted !== null && r.posted >= start && r.posted <= asOf)
      .length,
    // Nothing after the as-of day counts, so the three figures agree.
    latest: latest(reviews.map((r) => r.posted).filter((d) => d !== null && d <= asOf)),
    total: reviews.length,
  };
}

/** Each review mention, with its review, for the reviews still on their source. */
function reviewMentions(competitor: Competitor) {
  const reviews = new Map(current(competitor).map((review) => [review.id, review]));
  return competitor.insights.flatMap((insight) => {
    const review = reviews.get(insight.ref);
    return review === undefined
      ? []
      : insight.mentions.map((mention) => ({ ...mention, persona: insight.persona, review }));
  });
}

/** The company's own current claims: a testimonial is a customer's words, not the company's claim. */
function currentOwnClaims(competitor: Competitor): string[] {
  return competitor.claims
    .filter((claim) => claim.superseded === null && claim.kind !== "testimonial")
    .map((claim) => claim.id);
}

function claimedFeatures(competitor: Competitor): Set<string> {
  const active = new Set(currentOwnClaims(competitor));
  return new Set(
    competitor.insights
      .filter((i) => active.has(i.ref))
      .flatMap((i) => i.mentions.map((m) => m.feature)),
  );
}

function claimedPersonas(competitor: Competitor): Set<string> {
  const active = new Set(currentOwnClaims(competitor));
  return new Set(
    competitor.insights
      .filter((i) => active.has(i.ref) && i.persona !== null)
      .map((i) => i.persona ?? ""),
  );
}

function evidence(competitor: Competitor, asOf: string): string {
  const rows = SOURCES.flatMap((source) => {
    const all = competitor.reviews.filter((review) => review.source === source);
    if (all.length === 0) return [];
    const live = all.filter((review) => review.gone === null);
    const dates = live
      .map((review) => review.posted)
      .filter((d): d is string => d !== null)
      .sort((a, b) => a.localeCompare(b));
    return [
      [
        source,
        String(live.length),
        String(all.length - live.length),
        dates[0] ?? "none",
        dates.at(-1) ?? "none",
      ],
    ];
  });
  const r = relevance(competitor, asOf);
  const superseded = competitor.claims.filter((claim) => claim.superseded !== null).length;
  const records = competitor.reviews.length + competitor.claims.length;
  return [
    rows.length === 0
      ? "No reviews collected."
      : table(["Source", "Current", "Gone", "First posted", "Latest posted"], rows),
    "",
    `Latest review: ${r.latest ?? "none"}`,
    `Reviews in the 12 months to ${asOf}: ${String(r.lastYear)}`,
    `Site claims: ${String(competitor.claims.length - superseded)} current, ${String(superseded)} superseded`,
    `Tagged: ${String(competitor.insights.length)} of ${String(records)} records`,
    `Last collected: ${latest([...competitor.reviews, ...competitor.claims].map((record) => record.fetched)) ?? "never"}`,
  ].join("\n");
}

function personas(competitor: Competitor, taxonomy: Taxonomy): string {
  // Every tagged review still on its source counts toward its persona.
  const live = new Set(current(competitor).map((review) => review.id));
  const reviewers = new Map<string, Set<string>>();
  for (const insight of competitor.insights) {
    if (insight.persona === null || !live.has(insight.ref)) continue;
    reviewers.set(insight.persona, (reviewers.get(insight.persona) ?? new Set()).add(insight.ref));
  }
  const claimed = claimedPersonas(competitor);
  const ids = [...new Set([...reviewers.keys(), ...claimed])].sort((a, b) => a.localeCompare(b));
  if (ids.length === 0) return "none";
  return table(
    ["Persona", "Reviews", "Claimed on site", "Acme actor"],
    ids.map((id) => [
      id,
      String(reviewers.get(id)?.size ?? 0),
      claimed.has(id) ? "yes" : "no",
      taxonomy.personas.get(id)?.actor ?? "none",
    ]),
  );
}

function features(competitor: Competitor, taxonomy: Taxonomy): string {
  const mentions = reviewMentions(competitor);
  const claimed = claimedFeatures(competitor);
  const ids = [...new Set([...mentions.map((m) => m.feature), ...claimed])];
  if (ids.length === 0) return "none";
  const rows = ids.map((id) => {
    const own = mentions.filter((m) => m.feature === id);
    const reviews = new Set(own.map((m) => m.review.id)).size;
    const feature = taxonomy.features.get(id);
    return {
      id,
      reviews,
      row: [
        id,
        feature?.name ?? id,
        feature?.stage ?? "",
        claimed.has(id) ? "yes" : "no",
        String(reviews),
        ...SENTIMENTS.map((s) => String(own.filter((m) => m.sentiment === s).length)),
        feature?.glossary ?? "—",
      ],
    };
  });
  rows.sort((a, b) => b.reviews - a.reviews || a.id.localeCompare(b.id));
  const header = [
    "Feature",
    "Name",
    "Stage",
    "Claimed",
    "Reviews",
    "Positive",
    "Negative",
    "Mixed",
    "Neutral",
    "Glossary",
  ];
  const note =
    "Reviews counts reviews; the sentiment columns count mentions, and one review may mention a feature more than once.";
  return `${table(
    header,
    rows.map((r) => r.row),
  )}\n\n${note}`;
}

function ranking(competitor: Competitor, taxonomy: Taxonomy, kind: Kind): string {
  const groups = new Map<string, ReviewRecord[]>();
  for (const mention of reviewMentions(competitor).filter((m) => m.kind === kind)) {
    const list = groups.get(mention.feature) ?? [];
    if (!list.includes(mention.review)) list.push(mention.review);
    groups.set(mention.feature, list);
  }
  const ranked = [...groups.entries()].map(([id, reviews]) => ({
    id,
    last: latest(reviews.map((r) => r.posted)) ?? "",
    reviews,
  }));
  ranked.sort(
    (a, b) =>
      b.reviews.length - a.reviews.length ||
      b.last.localeCompare(a.last) ||
      a.id.localeCompare(b.id),
  );
  return orNone(
    ranked.map(({ id, last, reviews }) => {
      const pastedOnly = reviews.every((review) => review.source === "pasted")
        ? " (pasted only)"
        : "";
      const refs = reviews
        .map((review) => review.id)
        .sort((a, b) => a.localeCompare(b))
        .join(", ");
      return `- ${id} (${taxonomy.features.get(id)?.name ?? id}): ${plural(reviews.length, "review")}, latest ${last || "undated"} — ${refs}${pastedOnly}`;
    }),
  );
}

function prices(competitor: Competitor): string {
  const priced = competitor.claims.filter((claim) => claim.kind === "price");
  const now = priced.filter((claim) => claim.superseded === null);
  const before = priced.filter((claim) => claim.superseded !== null);
  return orNone([
    ...now.map((c) => `- Current: ${oneLine(c.text)} (${c.url}, since ${c.fetched}; ${c.id})`),
    ...before.map(
      (c) =>
        `- Earlier: ${oneLine(c.text)} (${c.url}, ${c.fetched} to ${c.superseded?.date ?? ""}; ${c.id})`,
    ),
  ]);
}

function one(root: string, slug: string, asOf: string, taxonomy: Taxonomy): string {
  const competitor = load(root, slug);
  return [
    `### Evidence\n\n${evidence(competitor, asOf)}`,
    `### Personas\n\n${personas(competitor, taxonomy)}`,
    `### Features\n\n${features(competitor, taxonomy)}`,
    `### Praise\n\n${ranking(competitor, taxonomy, "praise")}`,
    `### Pain\n\n${ranking(competitor, taxonomy, "pain")}`,
    `### Missing\n\n${ranking(competitor, taxonomy, "missing")}`,
    `### Prices\n\n${prices(competitor)}`,
  ].join("\n\n");
}

/** The stages in the order the taxonomy first names them, with `aspect` last. */
function stageOrder(taxonomy: Taxonomy): string[] {
  const stages = new Set([...taxonomy.features.values()].map((feature) => feature.stage));
  stages.delete("aspect");
  return [...stages, "aspect"];
}

/**
 * The landscape's lookup (C23): for each feature with evidence, by stage, one
 * row per competitor with any: claimed on its site, and how many reviews speak
 * of it positively, negatively or mixed, and how many say it is missing. A
 * review counts once per column.
 */
function lookup(competitors: Competitor[], taxonomy: Taxonomy): string {
  const perCompetitor = competitors.map((c) => ({
    claimed: claimedFeatures(c),
    mentions: reviewMentions(c),
    slug: c.slug,
  }));
  const ids = [
    ...new Set(perCompetitor.flatMap((c) => [...c.mentions.map((m) => m.feature), ...c.claimed])),
  ];
  const order = stageOrder(taxonomy);
  const stage = (id: string) => order.indexOf(taxonomy.features.get(id)?.stage ?? "aspect");
  ids.sort((a, b) => stage(a) - stage(b) || a.localeCompare(b));
  const blocks = ids.map((id) => {
    const rows = perCompetitor.flatMap((c) => {
      const own = c.mentions.filter((m) => m.feature === id);
      if (own.length === 0 && !c.claimed.has(id)) return [];
      const reviews = (keep: (m: (typeof own)[number]) => boolean) =>
        String(new Set(own.filter(keep).map((m) => m.review.id)).size);
      const opinion = (sentiment: Sentiment) =>
        reviews((m) => m.kind !== "missing" && m.sentiment === sentiment);
      return [
        [
          c.slug,
          c.claimed.has(id) ? "yes" : "no",
          opinion("positive"),
          opinion("negative"),
          opinion("mixed"),
          reviews((m) => m.kind === "missing"),
        ],
      ];
    });
    const feature = taxonomy.features.get(id);
    const heading = `#### ${feature?.stage ?? "aspect"} · ${id} (${feature?.name ?? id})`;
    return `${heading}\n\n${table(["Competitor", "Claimed on site", "Positive", "Negative", "Mixed", "Missing"], rows)}`;
  });
  return orNone(blocks).replaceAll("\n#### ", "\n\n#### ");
}

function all(root: string, asOf: string, taxonomy: Taxonomy): string {
  const competitors = slugs(root).map((slug) => load(root, slug));
  const names = competitors.map((c) => c.slug);

  const relevanceRows = competitors
    .map((c) => ({ r: relevance(c, asOf), slug: c.slug }))
    .sort(
      (a, b) => (b.r.latest ?? "").localeCompare(a.r.latest ?? "") || a.slug.localeCompare(b.slug),
    )
    .map(({ r, slug }) => [slug, r.latest ?? "none", String(r.lastYear), String(r.total)]);

  const personaIds = [...taxonomy.personas.values()].filter((p) => !p.withdrawn).map((p) => p.id);
  const coverage = personaIds.map((id) => [
    id,
    taxonomy.personas.get(id)?.actor ?? "none",
    ...competitors.map((c) => {
      const reviews = new Set(
        reviewMentions(c)
          .filter((m) => m.persona === id)
          .map((m) => m.review.id),
      ).size;
      const parts = [
        ...(claimedPersonas(c).has(id) ? ["claimed"] : []),
        ...(reviews > 0 ? [plural(reviews, "review")] : []),
      ];
      return parts.length > 0 ? parts.join(", ") : "—";
    }),
  ]);

  return [
    `### Relevance\n\n${relevanceRows.length === 0 ? "none" : table(["Competitor", "Latest review", "Last 12 months", "Total reviews"], relevanceRows)}`,
    `### Features\n\n${lookup(competitors, taxonomy)}`,
    `### Persona coverage\n\n${coverage.length === 0 ? "none" : table(["Persona", "Acme actor", ...names], coverage)}`,
  ].join("\n\n");
}

function slugs(root: string): string[] {
  const dir = competitorsDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "taxonomy")
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export function stats(root: string, options: { asOf: string; slug?: string }): string {
  if (!isoDate.safeParse(options.asOf).success) {
    throw new Error(`--as-of must be a real date as YYYY-MM-DD, not "${options.asOf}"`);
  }
  if (options.slug !== undefined && !slugs(root).includes(options.slug)) {
    throw new Error(`no competitor "${options.slug}" in docs/competitors/`);
  }
  const taxonomy = loadTaxonomy(root);
  const body =
    options.slug === undefined
      ? all(root, options.asOf, taxonomy)
      : one(root, options.slug, options.asOf, taxonomy);
  return `${body}\n`;
}
