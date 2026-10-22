// pnpm sweep recall: how many planted contradictions a run finds (spec §15).
// Seeds live in seeds/seeds.json, written against the repo's real text; a
// seed whose text is gone fails loudly, so it is rewritten, never silently
// skipped.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as z from "zod";

import type { Run } from "./exec.ts";
import type { Finding, FindingKind } from "./schema.ts";

import { realRun } from "./exec.ts";
import { normaliseQuote } from "./quote.ts";
import { FindingKindSchema } from "./schema.ts";

const SeedSchema = z.strictObject({
  id: z.string().min(1),
  /** A repo path, or `snapshot/…` for a bead or memory as the run's snapshot renders it. */
  file: z.string().min(1),
  find: z.string().min(1),
  replace: z.string().min(1),
  kind: FindingKindSchema,
  /** Kinds that also count as finding it (a changed number may be a conflict or code drift). */
  accepts: z.array(FindingKindSchema).optional(),
  /** Refs a finding must cite, all of them, to count. */
  refs: z.array(z.string().min(1)).min(1),
});
export type Seed = z.infer<typeof SeedSchema>;

export const SEEDS: Seed[] = SeedSchema.array().parse(
  JSON.parse(readFileSync(path.join(import.meta.dirname, "seeds/seeds.json"), "utf8")),
);

const inSnapshot = (seed: Seed) => seed.file.startsWith("snapshot/");

/**
 * Clones the repo's committed state into `<outDir>/repo`, plants every repo
 * seed there and commits it, so timelines still work. Returns the clone.
 */
export function plant(root: string, seeds: Seed[], outDir: string, run: Run = realRun): string {
  const repo = path.join(outDir, "repo");
  mkdirSync(outDir, { recursive: true });
  run("git", ["clone", "-q", "--no-hardlinks", root, repo]);
  apply(
    repo,
    seeds.filter((seed) => !inSnapshot(seed)),
  );
  run("git", ["add", "-A"], { cwd: repo });
  run(
    "git",
    [
      "-c",
      "user.name=sweep",
      "-c",
      "user.email=sweep@localhost",
      "commit",
      "-q",
      "-m",
      "Plant recall seeds",
    ],
    {
      cwd: repo,
    },
  );
  return repo;
}

/** Plants the bead and memory seeds in a run's snapshot (never in bd). */
export function plantSnapshot(runDir: string, seeds: Seed[]): void {
  apply(runDir, seeds.filter(inSnapshot));
}

function apply(dir: string, seeds: Seed[]): void {
  for (const seed of seeds) {
    const file = path.join(dir, seed.file);
    const text = readFileSync(file, "utf8");
    if (!text.includes(seed.find)) {
      throw new Error(`seed ${seed.id}: its text is no longer in ${seed.file}; rewrite the seed`);
    }
    writeFileSync(file, text.replace(seed.find, seed.replace));
  }
}

/** The ref a finding cites for a seed's file: a repo path, or the bead or memory a snapshot file renders. */
function seedRef(seed: Seed): string {
  const memory = /^snapshot\/memories\/(.+)\.md$/.exec(seed.file)?.[1];
  if (memory !== undefined) return `memory:${memory}`;
  const bead = /^snapshot\/beads\/(.+)\.md$/.exec(seed.file)?.[1];
  return bead === undefined ? seed.file : `bead:${bead}`;
}

/**
 * Whether a finding quotes the planted passage itself: citing the right files
 * for another reason (a real contradiction in a big spec) does not count.
 */
function quotesPlanted(seed: Seed, finding: Finding): boolean {
  const planted = normaliseQuote(seed.replace);
  return finding.sides.some((side) => {
    const quote = normaliseQuote(side.quote);
    return side.ref === seedRef(seed) && (planted.includes(quote) || quote.includes(planted));
  });
}

export function score(
  seeds: Seed[],
  findings: Finding[],
): { found: string[]; missed: string[]; recall: number } {
  const found = seeds.filter((seed) =>
    findings.some((finding) => {
      const kinds: FindingKind[] = seed.accepts ?? [seed.kind];
      const refs = new Set([...finding.sides, ...finding.reach].map((side) => side.ref));
      return (
        kinds.includes(finding.kind) &&
        quotesPlanted(seed, finding) &&
        seed.refs.every((ref) => refs.has(ref))
      );
    }),
  );
  const ids = new Set(found.map((seed) => seed.id));
  return {
    found: found.map((seed) => seed.id),
    missed: seeds.filter((seed) => !ids.has(seed.id)).map((seed) => seed.id),
    recall: seeds.length === 0 ? 1 : found.length / seeds.length,
  };
}
