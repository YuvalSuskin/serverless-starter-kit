// The text behind a side's ref, for quote checks (matching, verify): a repo
// file, or a bead or memory as the run's snapshot rendered it, since that
// rendering is what the checkers quoted.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function refText(root: string, runDir?: string): (ref: string) => string {
  const snapshotFile = new Map<string, string>();
  const index = runDir === undefined ? undefined : path.join(runDir, "snapshot/index.json");
  if (index !== undefined && existsSync(index)) {
    const files = JSON.parse(readFileSync(index, "utf8")) as Record<string, string>;
    for (const [file, ref] of Object.entries(files)) snapshotFile.set(ref, file);
  }
  const read = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : "");
  return (ref) => {
    if (!/^(bead|memory):/.test(ref)) return read(path.join(root, ref));
    const file = snapshotFile.get(ref);
    return file === undefined || runDir === undefined ? "" : read(path.join(runDir, file));
  };
}
