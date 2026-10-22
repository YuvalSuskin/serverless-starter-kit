// The tracker database a copy may already hold when `pnpm rename` starts.
// Claude Code's SessionStart hook runs `bd prime`, and bd creates an empty,
// uninitialised database in a copy that has none; so can the beads MCP server
// or a stray `bd` command. An empty one is set aside so the rename can start
// a fresh tracker; one holding anything stops the rename (TB130).
import { existsSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";

import { renamedSlug, type Runner } from "./finish.ts";

/** bd's database folders under `.beads/`: embedded, and server mode. */
const DIRS = ["embeddeddolt", "dolt"] as const;

export type TrackerState =
  | { kind: "none" }
  | { kind: "empty"; dirs: string[] }
  | { kind: "used"; dirs: string[]; why: string };

const plural = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? "" : "s"}`;

/** What bd answers as JSON, or why it could not. */
function ask(run: Runner, args: string[]): { json: Record<string, unknown> } | { error: string } {
  const result = run("bd", args);
  const command = ["bd", ...args].join(" ");
  if (result.status !== 0) {
    const tail = `${result.stdout}${result.stderr}`.trim().split("\n").slice(-3).join(" ");
    return { error: `${command} failed: ${tail}` };
  }
  try {
    return { json: JSON.parse(result.stdout) as Record<string, unknown> };
  } catch {
    return { error: `${command} did not answer JSON` };
  }
}

/**
 * Whether `.beads/` holds a database, and whether it is empty: no issue (open
 * or closed), no memory, and no prefix but the one `.beads/config.yaml` names (the template's own
 * before the rename). Anything bd cannot
 * answer counts as used: only a database proven empty is set aside.
 */
export function existingTracker(root: string, run: Runner): TrackerState {
  const dirs = DIRS.filter((dir) => existsSync(path.join(root, ".beads", dir)));
  if (dirs.length === 0) return { kind: "none" };

  const used = (why: string): TrackerState => ({ dirs, kind: "used", why });
  const count = ask(run, ["count", "--include-infra", "--json"]);
  if ("error" in count) return used(count.error);
  const issues = Number(count.json.count);
  if (!Number.isInteger(issues)) return used("bd count gave no count");
  if (issues > 0) return used(`it holds ${plural(issues, "issue")}`);

  const memories = ask(run, ["memories", "--json"]);
  if ("error" in memories) return used(memories.error);
  const keys = Object.keys(memories.json).filter((key) => key !== "schema_version");
  if (keys.length > 0) {
    const held = keys.length === 1 ? "1 memory" : `${String(keys.length)} memories`;
    return used(`it holds ${held}`);
  }

  const prefix = ask(run, ["config", "get", "issue_prefix", "--json"]);
  if ("error" in prefix) return used(prefix.error);
  const value = typeof prefix.json.value === "string" ? prefix.json.value : "";
  if (value !== "" && value !== renamedSlug(root)) return used(`it has the prefix "${value}"`);

  return { dirs, kind: "empty" };
}

/** Moves each database to `.beads/set-aside-<stamp>/<dir>` (ignored by git); returns the new paths. */
export function setAsideTracker(root: string, dirs: string[], now = new Date()): string[] {
  const stamp = now.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d+/, "");
  const into = path.join(".beads", `set-aside-${stamp}`);
  mkdirSync(path.join(root, into), { recursive: true });
  return dirs.map((dir) => {
    const to = path.join(into, dir);
    renameSync(path.join(root, ".beads", dir), path.join(root, to));
    return to;
  });
}
