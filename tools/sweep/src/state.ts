// The sweep's baseline between runs (spec §5 step 9, §8 gate): one JSON value
// in bd kv under sweep/last-run. bd prime loads only memory.* keys, so this
// never reaches an agent's context.
import * as z from "zod";

import type { Run } from "./exec.ts";

import { isFindingLine, type LedgerLine } from "./schema.ts";

const KEY = "sweep/last-run";

const SweepStateSchema = z.object({
  commit: z.string(),
  date: z.string(),
  batch: z.number().int().nullable(),
  pr: z.number().int().nullable(),
  verify: z.enum(["passed", "failed"]).nullable(),
  mergedCommit: z.string().nullable(),
  graphKey: z.string(),
  nextId: z.number().int().min(1),
});
export type SweepState = z.infer<typeof SweepStateSchema>;

export function readState(run: Run): SweepState | null {
  const store = JSON.parse(run("bd", ["kv", "list", "--json"])) as Record<string, string>;
  const value = store[KEY];
  if (value === undefined || value === "") return null;
  const parsed = SweepStateSchema.safeParse(JSON.parse(value));
  if (!parsed.success) throw new Error(`${KEY} in bd kv does not parse: ${parsed.error.message}`);
  return parsed.data;
}

export function writeState(run: Run, state: SweepState): void {
  run("bd", ["kv", "set", KEY, JSON.stringify(SweepStateSchema.parse(state))]);
}

/**
 * The next finding IDs. nextId lives in bd kv and the ledger in git; if kv
 * fell behind (lost, not synced), the ledger's highest ID still wins, so an
 * ID is never issued twice.
 */
export function nextIds(state: SweepState, count: number, ledger: LedgerLine[]): string[] {
  const highest = Math.max(
    0,
    ...ledger.filter(isFindingLine).map((line) => Number(line.finding.id.slice(3))),
  );
  const first = Math.max(state.nextId, highest + 1);
  return Array.from(
    { length: count },
    (_, offset) => `SW-${String(first + offset).padStart(3, "0")}`,
  );
}
