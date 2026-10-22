// Record IDs. A review keeps its source's own ID; without one it
// gets a hash of posted|text, and identical twins within one collection get
// an ordinal suffix, -2, -3, so re-collecting them repeats the
// same IDs. A claim is a hash of url|kind|text.
import { createHash } from "node:crypto";

const hash = (value: string) => createHash("sha1").update(value).digest("hex").slice(0, 10);

interface IdInput {
  posted: null | string;
  source_id?: null | string;
  text: string;
}

export function reviewIds(source: string, records: IdInput[]): string[] {
  const seen = new Map<string, number>();
  return records.map((record) => {
    if (record.source_id) return `${source}-${record.source_id}`;
    const base = [source, hash([record.posted ?? "", record.text].join("|"))].join("-");
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${String(count)}`;
  });
}

export function claimId(claim: { kind: string; text: string; url: string }): string {
  return ["site", hash([claim.url, claim.kind, claim.text].join("|"))].join("-");
}
