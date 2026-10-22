// Every rule the data under docs/competitors/ must keep.
// Problems name the file and the record, so a person or the skill can fix
// the tier they came from. References resolve against every ID present, valid
// or not, so one bad record gives one problem, not a cascade.

import type { z } from "zod";

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { competitorsDir, loadYaml } from "./files.ts";
import { checkAgainst } from "./git-baseline.ts";
import { PRODUCT_ID_FILES, readIdTable } from "./product-ids.ts";
import {
  ClaimRecord,
  Feature,
  InsightEntry,
  Meta,
  Persona,
  RAW_FILES,
  ReviewRecord,
  SOURCES,
} from "./schema.ts";

export interface Problem {
  file: string;
  message: string;
}

interface Loaded<T> {
  /** Every string `id` (or `ref`) in the file, whether or not its item is valid. */
  ids: string[];
  valid: T[];
}

export function check(root: string, options: { against?: string; slug?: string } = {}): Problem[] {
  const problems: Problem[] = [];
  const report = (file: string, message: string) =>
    problems.push({ file: path.relative(root, file), message });
  const dir = competitorsDir(root);
  // The template ships with no competitor data: until the competitor-intel
  // skill creates docs/competitors/ there is nothing to check.
  if (!existsSync(dir)) return problems;

  // A product doc that cannot be read is one problem; its links go unchecked.
  const productIds = (file: string): Set<string> | undefined => {
    try {
      return readIdTable(path.join(root, file));
    } catch (error) {
      report(path.join(root, file), (error as Error).message);
      return undefined;
    }
  };

  const featuresFile = path.join(dir, "taxonomy", "features.yaml");
  const personasFile = path.join(dir, "taxonomy", "personas.yaml");
  const features = loadList(featuresFile, Feature, report);
  const personas = loadList(personasFile, Persona, report);
  checkTaxonomy(featuresFile, features, "glossary", productIds(PRODUCT_ID_FILES.glossary), report);
  checkTaxonomy(personasFile, personas, "actor", productIds(PRODUCT_ID_FILES.actors), report);

  const taxonomy = { features, personas };
  const slugs = competitorSlugs(dir);
  if (options.slug !== undefined && !slugs.includes(options.slug)) {
    report(path.join(dir, options.slug), "no competitor has this slug");
  }
  for (const slug of slugs) {
    if (options.slug === undefined || options.slug === slug) {
      checkCompetitor(path.join(dir, slug), slug, taxonomy, report);
    }
  }
  if (options.against !== undefined) problems.push(...checkAgainst(root, options.against));
  return problems;
}

type Report = (file: string, message: string) => void;

function competitorSlugs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "taxonomy")
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function describe(issues: z.core.$ZodIssue[]): string {
  return issues.map((issue) => `${issue.path.join(".")} ${issue.message}`.trim()).join("; ");
}

function labelOf(item: unknown, index: number): string {
  if (item !== null && typeof item === "object") {
    const { id, ref } = item as { id?: unknown; ref?: unknown };
    if (typeof id === "string") return id;
    if (typeof ref === "string") return ref;
  }
  return `item ${String(index + 1)}`;
}

function loadList<T>(file: string, schema: z.ZodType<T>, report: Report): Loaded<T> {
  let data: unknown;
  try {
    data = loadYaml(file) ?? [];
  } catch (error) {
    report(file, `does not parse as YAML: ${(error as Error).message.split("\n")[0] ?? ""}`);
    return { ids: [], valid: [] };
  }
  if (!Array.isArray(data)) {
    report(file, "must be a YAML list");
    return { ids: [], valid: [] };
  }
  const loaded: Loaded<T> = { ids: [], valid: [] };
  data.forEach((item: unknown, index) => {
    const label = labelOf(item, index);
    if (!label.startsWith("item ")) loaded.ids.push(label);
    const parsed = schema.safeParse(item);
    if (parsed.success) loaded.valid.push(parsed.data);
    else report(file, `${label}: ${describe(parsed.error.issues)}`);
  });
  return loaded;
}

const LINK_NAMES = { actor: "actor", glossary: "glossary term" };

function checkTaxonomy(
  file: string,
  entries: Loaded<Feature | Persona>,
  link: "actor" | "glossary",
  productIds: Set<string> | undefined,
  report: Report,
): void {
  if (entries.ids.length === 0) {
    report(
      file,
      `has no ${link === "glossary" ? "features" : "personas"}; the taxonomy must not be empty`,
    );
  }
  const seen = new Set<string>();
  for (const entry of entries.valid) {
    if (seen.has(entry.id)) report(file, `${entry.id}: duplicate ID`);
    seen.add(entry.id);
    const target = link === "glossary" ? (entry as Feature).glossary : (entry as Persona).actor;
    if (target !== null && productIds !== undefined && !productIds.has(target)) {
      report(
        file,
        `${entry.id}: ${link} "${target}" is not a current ${LINK_NAMES[link]} in docs/product/shared/`,
      );
    }
    const replacement = entry.withdrawn?.replaced_by;
    if (replacement) checkReplacement(file, entry.id, replacement, entries, report);
  }
}

function checkReplacement(
  file: string,
  id: string,
  replacement: string,
  entries: Loaded<Feature | Persona>,
  report: Report,
): void {
  if (replacement === id) report(file, `${id}: replaced_by "${replacement}" is the term itself`);
  else if (!entries.ids.includes(replacement))
    report(file, `${id}: replaced_by "${replacement}" is not in this file`);
  else if (entries.valid.find((entry) => entry.id === replacement)?.withdrawn) {
    report(file, `${id}: replaced_by "${replacement}" is withdrawn too`);
  }
}

interface Taxonomy {
  features: Loaded<Feature>;
  personas: Loaded<Persona>;
}

function checkCompetitor(folder: string, slug: string, taxonomy: Taxonomy, report: Report): void {
  checkMeta(path.join(folder, "meta.yaml"), slug, report);
  const rawDir = path.join(folder, "raw");
  checkFileNames(folder, rawDir, report);

  // Every raw ID, and the file it first appeared in.
  const rawIds = new Map<string, string>();
  const register = (file: string, ids: string[]) => {
    for (const id of ids) {
      const first = rawIds.get(id);
      if (first === undefined) rawIds.set(id, path.basename(file));
      else report(file, `${id}: duplicate ID (also in ${first})`);
    }
  };
  for (const source of SOURCES) register(...checkReviews(rawDir, source, report));
  register(...checkClaims(path.join(rawDir, "site.yaml"), report));
  checkInsights(path.join(folder, "insights.yaml"), rawIds, taxonomy, report);
}

function checkMeta(file: string, slug: string, report: Report): void {
  if (!existsSync(file)) {
    report(file, "is missing");
    return;
  }
  let data: unknown;
  try {
    data = loadYaml(file);
  } catch (error) {
    report(file, `does not parse as YAML: ${(error as Error).message.split("\n")[0] ?? ""}`);
    return;
  }
  const parsed = Meta.safeParse(data);
  if (!parsed.success) report(file, describe(parsed.error.issues));
  else if (parsed.data.slug !== slug)
    report(file, `slug "${parsed.data.slug}" must be the folder's name, "${slug}"`);
}

// What a competitor folder may hold; anything else (a .yml, a stray note) is
// flagged, or its records would silently go unread.
const COMPETITOR_ENTRIES = [
  "changelog.md",
  "insights.yaml",
  "meta.yaml",
  "profile.md",
  "raw",
  "walkthrough",
];
const SCREENSHOT = /\.(?:jpe?g|png|webp)$/;

/** A walkthrough holds flows.md and screens/<image> only. */
function checkWalkthrough(dir: string, report: Report): void {
  for (const name of readdirSync(dir)) {
    if (name === "flows.md") continue;
    if (name !== "screens") {
      report(
        path.join(dir, name),
        `"${name}" is not a walkthrough file: flows.md and screens/ only`,
      );
      continue;
    }
    for (const image of readdirSync(path.join(dir, name))) {
      if (!SCREENSHOT.test(image))
        report(path.join(dir, name, image), `"${image}" is not a screenshot (.png, .jpg, .webp)`);
    }
  }
}

function checkFileNames(folder: string, rawDir: string, report: Report): void {
  for (const name of readdirSync(folder)) {
    if (!COMPETITOR_ENTRIES.includes(name))
      report(path.join(folder, name), `"${name}" is not a file this folder holds`);
  }
  const walkthrough = path.join(folder, "walkthrough");
  if (existsSync(walkthrough)) checkWalkthrough(walkthrough, report);
  if (!existsSync(rawDir)) return;
  for (const name of readdirSync(rawDir)) {
    const source = name.replace(/\.yaml$/, "");
    if (!name.endsWith(".yaml")) {
      report(path.join(rawDir, name), `"${name}" is not a raw file: raw/ holds <source>.yaml only`);
    } else if (!(RAW_FILES as readonly string[]).includes(source)) {
      report(
        path.join(rawDir, name),
        `"${source}" is not a source on the closed list (${RAW_FILES.join(", ")})`,
      );
    }
  }
}

function checkReviews(
  rawDir: string,
  source: (typeof SOURCES)[number],
  report: Report,
): [string, string[]] {
  const file = path.join(rawDir, `${source}.yaml`);
  const reviews = loadList(file, ReviewRecord, report);
  for (const review of reviews.valid) {
    if (review.source !== source)
      report(file, `${review.id}: source "${review.source}" must be "${source}", as the file is`);
    if (!review.id.startsWith(`${source}-`))
      report(file, `${review.id}: ID must start with "${source}-"`);
    if (review.gone !== null && review.gone < review.fetched) {
      report(file, `${review.id}: gone ${review.gone} is before fetched ${review.fetched}`);
    }
  }
  return [file, reviews.ids];
}

function checkClaims(file: string, report: Report): [string, string[]] {
  const claims = loadList(file, ClaimRecord, report);
  for (const claim of claims.valid) {
    if (!claim.id.startsWith("site-")) report(file, `${claim.id}: ID must start with "site-"`);
    const superseded = claim.superseded;
    if (superseded === null) continue;
    if (superseded.date < claim.fetched)
      report(file, `${claim.id}: superseded ${superseded.date} is before fetched ${claim.fetched}`);
    if (
      superseded.by !== null &&
      (superseded.by === claim.id || !claims.ids.includes(superseded.by))
    ) {
      report(
        file,
        `${claim.id}: superseded.by "${superseded.by}" is not another claim in this file`,
      );
    }
  }
  return [file, claims.ids];
}

function checkInsights(
  file: string,
  rawIds: Map<string, string>,
  taxonomy: Taxonomy,
  report: Report,
): void {
  const insights = loadList(file, InsightEntry, report);
  const tagged = new Set<string>();
  for (const insight of insights.valid) {
    const ref = insight.ref;
    if (!rawIds.has(ref)) report(file, `${ref}: ref resolves to no raw record`);
    if (tagged.has(ref)) report(file, `${ref}: more than one insight for this record`);
    tagged.add(ref);
    if (insight.persona !== null)
      checkTerm(file, ref, "persona", insight.persona, taxonomy.personas, report);
    for (const mention of insight.mentions)
      checkTerm(file, ref, "feature", mention.feature, taxonomy.features, report);
  }
}

function checkTerm(
  file: string,
  ref: string,
  kind: "feature" | "persona",
  id: string,
  entries: Loaded<Feature | Persona>,
  report: Report,
): void {
  if (!entries.ids.includes(id)) {
    report(file, `${ref}: ${kind} "${id}" is not in the taxonomy`);
    return;
  }
  const withdrawn = entries.valid.find((entry) => entry.id === id)?.withdrawn;
  if (withdrawn) {
    const replacement = withdrawn.replaced_by ? `; use "${withdrawn.replaced_by}"` : "";
    report(file, `${ref}: ${kind} "${id}" was withdrawn on ${withdrawn.date}${replacement}`);
  }
}
