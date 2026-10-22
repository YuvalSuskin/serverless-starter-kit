// `pnpm competitors fetch <source> <slug>`: run a source's collector for the
// listing confirmed in meta.yaml, then ingest what it found.
import path from "node:path";

import type { Fetcher } from "./http.ts";

import { collectGoogle } from "./collectors/google.ts";
import { competitorsDir, loadYaml } from "./files.ts";
import { ingest, type IngestReport } from "./ingest.ts";
import { Meta } from "./schema.ts";

function metaOf(root: string, slug: string): Meta {
  return Meta.parse(loadYaml(path.join(competitorsDir(root), slug, "meta.yaml")));
}

export async function fetchGoogle(
  root: string,
  slug: string,
  fetcher: Fetcher,
  key: string,
  today: string,
  options: { hl?: string } = {},
): Promise<
  IngestReport & {
    collected: number;
    complete: boolean;
    searchesUsed: number;
    statedCount: number;
    stopped: string;
  }
> {
  const place = metaOf(root, slug).listings.google;
  if (!place) throw new Error(`${slug}: no confirmed Google place in meta.yaml`);
  const { searchesUsed, statedCount, stopped, ...collected } = await collectGoogle(
    place,
    key,
    fetcher,
    options,
  );
  const report = ingest(root, slug, collected, today);
  return {
    ...report,
    collected: collected.records.length,
    complete: collected.complete,
    searchesUsed,
    statedCount,
    stopped,
  };
}
