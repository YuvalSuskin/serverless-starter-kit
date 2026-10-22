// Relative Markdown links: find them, resolve them, report the broken ones.
// The repo's links are plain inline links, so a fence-aware scan is enough and
// keeps each target's exact position for rewriting (archive moves, spec §10).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { classify, repoFiles } from "./scope.ts";

export interface Link {
  target: string;
  /** Where the target starts in the scanned text. */
  index: number;
  length: number;
}

// A link's target follows "](" and runs to the first space or unbalanced ")";
// one level of balanced parentheses is part of it, as in CommonMark (Next.js
// route groups such as app/(marketing)/).
const LINK = /\]\(((?:[^()\s]|\([^()\s]*\))+)/g;
const FENCE = /^(\s*)(`{3,}|~{3,})/;

export function findLinks(markdown: string): Link[] {
  const links: Link[] = [];
  let fence: string | null = null;
  let offset = 0;
  for (const line of markdown.split("\n")) {
    const opener = FENCE.exec(line)?.[2];
    if (fence !== null) {
      if (opener?.startsWith(fence)) fence = null;
    } else if (opener !== undefined) {
      fence = opener;
    } else {
      // Inline code spans become spaces of the same length, so positions hold.
      const visible = line.replace(/`[^`]*`/g, (span) => " ".repeat(span.length));
      for (const match of visible.matchAll(LINK)) {
        const target = match[1] ?? "";
        const index = offset + match.index + 2;
        links.push({ target, index, length: target.length });
      }
    }
    offset += line.length + 1;
  }
  return links;
}

/** The repo path a link points at, or null for links that are not files. */
export function resolveLink(fromFile: string, target: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) return null;
  if (/[<>{}]/.test(target)) return null;
  const file = decodeURI(target.split(/[#?]/)[0] ?? "");
  if (file === "") return null;
  const joined = file.startsWith("/")
    ? file.slice(1)
    : path.posix.join(path.posix.dirname(fromFile), file);
  return path.posix.normalize(joined).replace(/\/$/, "");
}

/** Broken links in live and archived Markdown (out-of-scope folders have their own checks). */
export function brokenLinks(root: string): { file: string; target: string }[] {
  const broken: { file: string; target: string }[] = [];
  for (const file of repoFiles(root)) {
    if (!file.endsWith(".md") || classify(file) === "out") continue;
    for (const link of findLinks(readFileSync(path.join(root, file), "utf8"))) {
      const resolved = resolveLink(file, link.target);
      if (resolved !== null && !existsSync(path.join(root, resolved))) {
        broken.push({ file, target: link.target });
      }
    }
  }
  return broken;
}
