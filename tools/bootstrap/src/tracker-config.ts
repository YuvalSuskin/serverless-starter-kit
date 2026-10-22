// The tracker's remote in `.beads/config.yaml`: reading it, removing it
// (the rename, a resume, `pnpm tracker:drop-remote`), and checking it is gone.
// bd's own `bd config unset sync.remote` leaves the nested form bd init
// writes (`sync:` / `remote:`) in place (TB142), so it is edited out here.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Runner } from "./finish.ts";

export const CONFIG = ".beads/config.yaml";

const VALUE = String.raw`[ \t]*(?:"([^"]*)"|'([^']*)'|([^\s#]*))`;
const FLAT_REMOTE = new RegExp(`^sync\\.remote:${VALUE}`);
const NESTED_REMOTE = new RegExp(`^[ \\t]+remote:${VALUE}`);
const SYNC = /^sync:[ \t]*(?:#.*)?$/;
const TOP_LEVEL = /^[^\s#]/;
const INDENTED = /^[ \t]+[^\s#]/;
/** A key that is exactly `remote` (indented) or `sync.remote`. */
const KEY_REMOTE = /^(?:[ \t]+remote|sync\.remote)[ \t]*:/;
const SYNC_KEY = /^sync[ \t]*:/;
/** `remote:` as a key inside a flow mapping: `sync: { remote: … }`. */
const FLOW_REMOTE = /[{,][ \t]*remote[ \t]*:/;

/**
 * Lines (1-based) of a config that look like a remote, read without parsing
 * the YAML: a second net for what `dropTrackerRemote` cannot read (flow
 * style, CRLF line ends).
 */
export function remoteLines(text: string): number[] {
  return text.split("\n").flatMap((line, i) => {
    const key = KEY_REMOTE.test(line);
    const flow = SYNC_KEY.test(line) && FLOW_REMOTE.test(line);
    return key || flow ? [i + 1] : [];
  });
}

/**
 * `.beads/config.yaml` without its tracker remote: `remote:` under a
 * top-level `sync:` (dropped with it when nothing else is under it), or a flat
 * `sync.remote:` key. Returns the remote it removed and its line (1-based), if
 * any. The text is edited line by line, not re-serialised, so its comments stay.
 */
export function dropTrackerRemote(text: string): {
  line: number;
  remote: string | undefined;
  text: string;
} {
  const lines = text.split("\n");
  const sync = lines.findIndex((line) => SYNC.test(line));
  // A new top-level key ends the block; a comment or a blank line does not.
  const after = lines.findIndex((line, i) => sync >= 0 && i > sync && TOP_LEVEL.test(line));
  const inBlock = (i: number) => sync >= 0 && i > sync && (after < 0 || i < after);
  const at = lines.findIndex(
    (line, i) => FLAT_REMOTE.test(line) || (inBlock(i) && NESTED_REMOTE.test(line)),
  );
  const match = FLAT_REMOTE.exec(lines[at] ?? "") ?? NESTED_REMOTE.exec(lines[at] ?? "");
  if (match === null) return { line: 0, remote: undefined, text };

  const drop = new Set([at]);
  const holdsMore = lines.some((line, i) => i !== at && inBlock(i) && INDENTED.test(line));
  if (inBlock(at) && !holdsMore) drop.add(sync);
  return {
    line: at + 1,
    remote: match[1] ?? match[2] ?? match[3] ?? "",
    text: lines.filter((_, i) => !drop.has(i)).join("\n"),
  };
}

/** The tracker remote `.beads/config.yaml` names, if any. */
export const configRemote = (root: string): string | undefined =>
  dropTrackerRemote(readFileSync(path.join(root, CONFIG), "utf8")).remote;

function json(run: Runner, args: string[]): unknown {
  const result = run("bd", args);
  if (result.status !== 0) return undefined;
  try {
    return JSON.parse(result.stdout) as unknown;
  } catch {
    return undefined;
  }
}

/** The Dolt remotes bd lists, by name; undefined when bd cannot say. */
function doltRemotes(run: Runner): string[] | undefined {
  const listed = json(run, ["dolt", "remote", "list", "--json"]);
  if (!Array.isArray(listed)) return undefined;
  return listed.map((entry) => String((entry as { name?: unknown }).name));
}

/**
 * Removes the tracker's remote: the line in `.beads/config.yaml` and every
 * Dolt remote bd lists. Then checks what bd and the file say: `left` names
 * whatever is still there (empty when the tracker is local only).
 */
export function removeTrackerRemote(root: string, run: Runner): { done: string[]; left: string[] } {
  const done: string[] = [];
  const file = path.join(root, CONFIG);
  const { remote, text } = dropTrackerRemote(readFileSync(file, "utf8"));
  if (remote !== undefined) {
    writeFileSync(file, text);
    done.push(`removed sync.remote (${remote}) from ${CONFIG}`);
  }
  for (const name of doltRemotes(run) ?? []) {
    if (run("bd", ["dolt", "remote", "remove", name]).status === 0) {
      done.push(`bd dolt remote remove ${name}`);
    }
  }

  const left: string[] = [];
  const after = readFileSync(file, "utf8");
  const lines = after.split("\n");
  for (const n of remoteLines(after)) {
    left.push(`${CONFIG}:${String(n)}: ${lines[n - 1]?.trim() ?? ""}`);
  }
  const value = (
    json(run, ["config", "get", "sync.remote", "--json"]) as { value?: unknown } | undefined
  )?.value;
  if (value === undefined) left.push("bd config get sync.remote gave no answer");
  else if (value !== "") {
    left.push(
      `bd config get sync.remote still says ${typeof value === "string" ? value : JSON.stringify(value)}`,
    );
  }
  const still = doltRemotes(run);
  if (still === undefined) left.push("bd dolt remote list gave no answer");
  else if (still.length > 0) left.push(`bd dolt remote list still shows ${still.join(", ")}`);
  return { done, left };
}
