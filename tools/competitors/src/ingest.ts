// The single way records enter raw/. Evidence is append-only: known
// records are never edited, only marked gone or superseded, and only when the
// collection proves it (a complete review collection; a fully re-extracted
// page for claims), so a collection that fails part-way loses nothing.
import { existsSync } from "node:fs";
import path from "node:path";
import * as z from "zod";

import { competitorsDir, readYamlList, writeYamlList } from "./files.ts";
import { claimId, reviewIds } from "./ids.ts";
import { ClaimRecord, REVIEW_FIELDS, ReviewRecord, SOURCES } from "./schema.ts";

const webUrl = z.url({ protocol: /^https?$/ });

const CollectedReview = z.strictObject({
  source_id: z.string().min(1).nullish(),
  ...REVIEW_FIELDS,
});

const CollectedClaim = z.strictObject({
  url: webUrl,
  kind: ClaimRecord.shape.kind,
  text: z.string().min(1),
});

const ReviewCollection = z.strictObject({
  source: z.enum(SOURCES),
  complete: z.boolean(),
  records: z.array(CollectedReview),
});

const ClaimCollection = z.strictObject({
  source: z.literal("site"),
  complete: z.boolean(),
  urls: z.array(webUrl),
  records: z.array(CollectedClaim),
});

const CollectedInput = z.discriminatedUnion("source", [ReviewCollection, ClaimCollection]);

/** What every collector and extraction subagent hands in, as JSON. */
export type Collected = z.infer<typeof CollectedInput>;
/** A review collection: what a review collector returns. */
export type ReviewCollection = z.infer<typeof ReviewCollection>;

export interface IngestReport {
  added: number;
  changedAtSource: string[];
  gone: number;
  reappeared: string[];
  superseded: number;
  unchanged: number;
}

export function ingest(root: string, slug: string, input: Collected, today: string): IngestReport {
  const parsed = CollectedInput.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) =>
      [issue.path.join("."), issue.message].join(" "),
    );
    throw new Error(`invalid collection: ${issues.join("; ")}`);
  }
  const folder = path.join(competitorsDir(root), slug);
  if (!existsSync(path.join(folder, "meta.yaml"))) {
    throw new Error(`${slug}: no meta.yaml; identify the competitor before collecting for it`);
  }
  const rawDir = path.join(folder, "raw");
  const collected = parsed.data;
  return collected.source === "site"
    ? ingestClaims(path.join(rawDir, "site.yaml"), collected, today)
    : ingestReviews(path.join(rawDir, `${collected.source}.yaml`), collected, today);
}

function emptyReport(): IngestReport {
  return { added: 0, changedAtSource: [], gone: 0, reappeared: [], superseded: 0, unchanged: 0 };
}

function ingestReviews(file: string, collected: ReviewCollection, today: string): IngestReport {
  const report = emptyReport();
  const existing = readYamlList(file, ReviewRecord);
  const byId = new Map(existing.map((record) => [record.id, record]));
  const ids = reviewIds(collected.source, collected.records);
  const seen = new Set<string>();
  const added: ReviewRecord[] = [];

  collected.records.forEach((incoming, index) => {
    const id = ids[index] ?? "";
    if (seen.has(id)) return;
    seen.add(id);
    const known = byId.get(id);
    if (known === undefined) {
      const fields: Record<string, unknown> = { ...incoming };
      delete fields.source_id;
      const record = ReviewRecord.safeParse({
        id,
        source: collected.source,
        ...fields,
        fetched: today,
        gone: null,
      });
      if (!record.success) {
        const issues = record.error.issues.map((issue) =>
          [issue.path.join("."), issue.message].join(" "),
        );
        throw new Error(`invalid collection: records.${String(index)}: ${issues.join("; ")}`);
      }
      added.push(record.data);
    } else if (known.gone !== null) {
      report.reappeared.push(id);
    } else if (known.text === incoming.text) {
      report.unchanged += 1;
    } else {
      report.changedAtSource.push(id);
    }
  });

  // A paste is never the whole set, so it never proves a record gone.
  const provesGone = collected.complete && collected.source !== "pasted";
  const kept = existing.map((record) => {
    if (!provesGone || record.gone !== null || seen.has(record.id)) return record;
    report.gone += 1;
    return { ...record, gone: today };
  });
  report.added = added.length;
  writeYamlList(file, [...kept, ...added]);
  return report;
}

function ingestClaims(
  file: string,
  collected: z.infer<typeof ClaimCollection>,
  today: string,
): IngestReport {
  const report = emptyReport();
  const existing = readYamlList(file, ClaimRecord);
  // A claim is known by what it says and where, whatever its ID.
  const keyOf = (claim: { kind: string; text: string; url: string }) =>
    `${claim.url}|${claim.kind}|${claim.text}`;
  // The current record for each claim, or its latest superseded one.
  const known = new Map<string, ClaimRecord>();
  for (const claim of existing) {
    if (known.get(keyOf(claim))?.superseded !== null) known.set(keyOf(claim), claim);
  }
  const ids = new Set(existing.map((claim) => claim.id));
  const seen = new Set<string>();
  const added: ClaimRecord[] = [];

  for (const incoming of collected.records) {
    const key = keyOf(incoming);
    const match = known.get(key);
    if (seen.has(match?.id ?? key)) continue;
    seen.add(match?.id ?? key);
    if (match?.superseded === null) {
      report.unchanged += 1;
      continue;
    }
    // New, or back after being superseded (a price that changes back): a new
    // current record, since the old one's superseded date is evidence (C13).
    const { kind, text, url } = incoming;
    const id = uniqueId(claimId(incoming), ids);
    ids.add(id);
    added.push({ id, url, kind, text, fetched: today, superseded: null });
  }

  // Only a page fully re-extracted in this run proves a claim changed.
  const reExtracted = new Set(collected.complete ? collected.urls : []);
  const kept = existing.map((claim) => {
    if (claim.superseded !== null || seen.has(claim.id) || !reExtracted.has(claim.url))
      return claim;
    const successors = added.filter((next) => next.url === claim.url && next.kind === claim.kind);
    report.superseded += 1;
    return {
      ...claim,
      superseded: { date: today, by: successors.length === 1 ? (successors[0]?.id ?? null) : null },
    };
  });
  report.added = added.length;
  writeYamlList(file, [...kept, ...added]);
  return report;
}

function uniqueId(base: string, taken: Set<string>): string {
  let n = 1;
  let id = base;
  while (taken.has(id)) {
    n += 1;
    id = `${base}-${String(n)}`;
  }
  return id;
}
