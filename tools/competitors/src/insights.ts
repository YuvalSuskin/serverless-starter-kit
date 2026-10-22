// Tier 2: which raw records still need tagging, and the single way
// tagged entries enter insights.yaml. A merge that names an unknown record,
// or a term the taxonomy lacks or withdrew, writes nothing.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { competitorsDir, readYamlList, writeYamlList } from "./files.ts";
import { ClaimRecord, Feature, InsightEntry, Persona, ReviewRecord, SOURCES } from "./schema.ts";

interface PendingRecord {
  kind?: string;
  ref: string;
  source: string;
  text: string;
}

function rawRecords(root: string, slug: string): PendingRecord[] {
  const rawDir = path.join(competitorsDir(root), slug, "raw");
  const present = existsSync(rawDir) ? readdirSync(rawDir) : [];
  const records: PendingRecord[] = [];
  for (const source of SOURCES) {
    if (!present.includes(`${source}.yaml`)) continue;
    for (const review of readYamlList(path.join(rawDir, `${source}.yaml`), ReviewRecord)) {
      records.push({ ref: review.id, source, text: review.text });
    }
  }
  for (const claim of readYamlList(path.join(rawDir, "site.yaml"), ClaimRecord)) {
    records.push({ kind: claim.kind, ref: claim.id, source: "site", text: claim.text });
  }
  return records;
}

const insightsFile = (root: string, slug: string) =>
  path.join(competitorsDir(root), slug, "insights.yaml");

/** Raw records with no insight yet; with `all`, every raw record (for re-tagging). */
export function pending(
  root: string,
  slug: string,
  options: { all?: boolean } = {},
): PendingRecord[] {
  if (options.all === true) return rawRecords(root, slug);
  const tagged = new Set(
    readYamlList(insightsFile(root, slug), InsightEntry).map((entry) => entry.ref),
  );
  return rawRecords(root, slug).filter((record) => !tagged.has(record.ref));
}

function termProblems(entries: InsightEntry[], root: string): string[] {
  const taxonomy = path.join(competitorsDir(root), "taxonomy");
  const features = new Map(
    readYamlList(path.join(taxonomy, "features.yaml"), Feature).map((f) => [f.id, f]),
  );
  const personas = new Map(
    readYamlList(path.join(taxonomy, "personas.yaml"), Persona).map((p) => [p.id, p]),
  );
  const problems: string[] = [];
  const checkTerm = (
    ref: string,
    kind: string,
    id: string,
    terms: Map<string, Feature | Persona>,
  ) => {
    const term = terms.get(id);
    if (term === undefined) problems.push(`${ref}: ${kind} "${id}" is not in the taxonomy`);
    else if (term.withdrawn) {
      const replacement = term.withdrawn.replaced_by ? `; use "${term.withdrawn.replaced_by}"` : "";
      problems.push(`${ref}: ${kind} "${id}" is withdrawn${replacement}`);
    }
  };
  for (const entry of entries) {
    if (entry.persona !== null) checkTerm(entry.ref, "persona", entry.persona, personas);
    for (const mention of entry.mentions)
      checkTerm(entry.ref, "feature", mention.feature, features);
  }
  return problems;
}

export function mergeInsights(
  root: string,
  slug: string,
  input: unknown[],
  options: { retag: boolean },
): { added: number; replaced: number } {
  const entries = input.map((item) => InsightEntry.parse(item));
  const file = insightsFile(root, slug);
  const existing = readYamlList(file, InsightEntry);
  const tagged = new Set(existing.map((entry) => entry.ref));
  const raw = new Set(rawRecords(root, slug).map((record) => record.ref));

  const problems = termProblems(entries, root);
  const refs = new Set<string>();
  for (const { ref } of entries) {
    if (!raw.has(ref)) problems.push(`${ref}: resolves to no raw record`);
    if (refs.has(ref)) problems.push(`${ref}: appears twice in this batch`);
    if (tagged.has(ref) && !options.retag)
      problems.push(`${ref}: already tagged (re-tag to replace it)`);
    refs.add(ref);
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));

  const replacements = new Map(entries.map((entry) => [entry.ref, entry]));
  const merged = existing.map((entry) => replacements.get(entry.ref) ?? entry);
  const added = entries.filter((entry) => !tagged.has(entry.ref));
  writeYamlList(file, [...merged, ...added]);
  return { added: added.length, replaced: entries.length - added.length };
}
