// `check --against <ref>`: evidence is append-only in git too. A
// raw record present at the ref must still exist unchanged, except that its
// gone or superseded value may be set once, from null.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse } from "yaml";

import type { Problem } from "./check.ts";

import { competitorsDir, loadYaml } from "./files.ts";

type RawItem = Record<string, unknown> & { id: string };

function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    // A raw file of a few hundred long reviews in a non-Latin script passes 1 MiB, Node's default.
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function itemsOf(data: unknown): RawItem[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (item): item is RawItem => typeof (item as null | { id?: unknown })?.id === "string",
  );
}

/** The raw/ files at `ref`, or undefined when `ref` is not a commit. */
function rawFilesAt(root: string, ref: string): string[] | undefined {
  try {
    git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return git(root, [
      "ls-tree",
      "-r",
      "--name-only",
      ref,
      "--",
      path.relative(root, competitorsDir(root)),
    ])
      .split("\n")
      .filter((file) => /\/raw\/[^/]+\.yaml$/.test(file));
  } catch {
    return undefined;
  }
}

/** What changed in one record since the ref, as messages. */
function changes(old: RawItem, item: RawItem | undefined): string[] {
  if (item === undefined) return ["deleted"];
  const found: string[] = [];
  for (const [field, was] of Object.entries(old)) {
    // gone and superseded may be set once, from null; every other field is fixed.
    const settable = field === "gone" || field === "superseded";
    if (settable && (was === null || was === undefined)) continue;
    if (!isDeepStrictEqual(was, item[field])) found.push(`${field} changed`);
  }
  return found;
}

export function checkAgainst(root: string, ref: string): Problem[] {
  const files = rawFilesAt(root, ref);
  if (files === undefined)
    return [{ file: ".", message: `"${ref}" is not a git ref this repo has` }];
  const problems: Problem[] = [];
  for (const file of files) {
    let now: RawItem[];
    try {
      now = itemsOf(loadYaml(path.join(root, file)));
    } catch {
      continue; // `check` already reports a file that does not parse.
    }
    const current = new Map(now.map((item) => [item.id, item]));
    for (const old of itemsOf(parse(git(root, ["show", `${ref}:${file}`]), { version: "1.2" }))) {
      for (const message of changes(old, current.get(old.id))) {
        problems.push({ file, message: `${old.id}: ${message} since ${ref}` });
      }
    }
  }
  return problems;
}
