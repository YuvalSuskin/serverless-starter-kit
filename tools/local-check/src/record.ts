// A passed `pnpm check:full`, kept per commit in the git data every worktree
// shares: running it again on the same commit only posts the proof, and the
// pre-push hook knows a commit passed. A commit names its whole tree, and
// check:full refuses a dirty one, so the commit is what was checked.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { coverageToken, type E2eCoverage } from "./e2e-matrix.ts";

export interface PassRecord {
  sha: string;
  passedAt: string;
  seconds: number;
  suites: string[];
  notRun: string[];
  /**
   * The e2e projects that passed on each build (CI15). Absent in a record
   * from before CI15, which then claims none.
   */
  e2e?: E2eCoverage;
  /**
   * The Node major the run was made on (CI16). Absent in a record from before
   * CI16, which readPass then does not count (CI17's proof job needs it).
   */
  node?: number;
}

const file = (dir: string, sha: string) => path.join(dir, `${sha}.json`);

/**
 * The commit's pass, if it passed here. A record from before CI16 names no
 * Node major, so its proof could not pass ci.yml's proof job: it reads as no
 * pass, and the commit is checked again.
 */
export function readPass(dir: string, sha: string): PassRecord | undefined {
  try {
    const record = JSON.parse(readFileSync(file(dir, sha), "utf8")) as PassRecord;
    return record.sha === sha && record.node !== undefined ? record : undefined;
  } catch {
    return undefined;
  }
}

export function writePass(dir: string, record: PassRecord): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file(dir, record.sha), `${JSON.stringify(record, null, 2)}\n`);
}

/**
 * The status's description: GitHub keeps at most 140 characters. It leads with
 * the e2e projects that ran on each build, which ci.yml's proof job reads (CI17), so the
 * suites listed after it are what a truncation cuts.
 */
export function describePass(record: PassRecord): string {
  const minutes = Math.floor(record.seconds / 60);
  const seconds = String(record.seconds % 60).padStart(2, "0");
  const e2e = record.e2e === undefined ? "" : `[${coverageToken(record.e2e, record.node)}] `;
  const text = `${e2e}passed in ${String(minutes)}m${seconds}s: ${record.suites.join(", ")}`;
  return text.length <= 140 ? text : `${text.slice(0, 139)}…`;
}
