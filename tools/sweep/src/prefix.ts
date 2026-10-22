// The project's bead-ID prefix, so the sweep names no project. bd keeps the
// prefix in its database; the repo holds two copies of it a plain file read can
// reach: `issue-prefix` in .beads/config.yaml (when set) and the database name
// in .beads/metadata.json (bd init names the database after the prefix).
// This is the one reader: tools/preview imports it as `@acme/sweep/prefix`.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** The placeholder project's prefix: what a repo with no beads config uses. */
export const DEFAULT_PREFIX = "acme";

// A project slug: letters, digits, "_" and "-", starting with a letter.
const PLAIN_WORD = /^[A-Za-z][\w-]*$/;

function readText(root: string, file: string): string | undefined {
  const full = path.join(root, file);
  return existsSync(full) ? readFileSync(full, "utf8") : undefined;
}

function fromConfig(root: string): string | undefined {
  const text = readText(root, ".beads/config.yaml");
  const match = text === undefined ? null : /^issue-prefix:\s*["']?([^"'\s#]+)["']?/m.exec(text);
  return match?.[1];
}

function fromMetadata(root: string): string | undefined {
  const text = readText(root, ".beads/metadata.json");
  if (text === undefined) return undefined;
  try {
    const name = (JSON.parse(text) as { dolt_database?: unknown }).dolt_database;
    return typeof name === "string" ? name : undefined;
  } catch {
    return undefined;
  }
}

/** The repo's bead prefix: `issue-prefix`, else the beads database name, else "acme". */
export function beadPrefix(root: string): string {
  for (const found of [fromConfig(root), fromMetadata(root)]) {
    if (found !== undefined && PLAIN_WORD.test(found)) return found;
  }
  return DEFAULT_PREFIX;
}

/** Matches bead IDs of one prefix: "<prefix>-ab1", with child numbers ".2". Global. */
export function beadIdPattern(prefix: string): RegExp {
  const escaped = prefix.replaceAll(/[.*+?^${}()|[\]\\-]/g, String.raw`\$&`);
  return new RegExp(`\\b${escaped}-[a-z0-9]+(?:\\.\\d+)*\\b`, "g");
}
