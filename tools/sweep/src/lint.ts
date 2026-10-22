// pnpm sweep lint: the checks that keep the repo sweepable, run in CI
// (spec §10 header rule, §12, §13): relative links resolve; every live spec,
// plan and research file names its beads; graphify stays out of every agent's
// instructions.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { brokenLinks } from "./links.ts";
import { beadIdPattern, beadPrefix, DEFAULT_PREFIX } from "./prefix.ts";
import { classify, repoFiles } from "./scope.ts";

export const UNLINKED_FILE = "tools/sweep/src/unlinked.json";
const HEADER_LINES = 15;

// Where a design, plan or research file must name its beads. Product specs are
// homes and are not covered.
const NEEDS_BEADS = /^docs\/(superpowers\/(specs|plans)|research)\/.+\.md$/;

// Files that instruct or hook every agent. The sweep's own files may name
// graphify; nothing else of this kind may.
const AGENT_FILES = [
  /(^|\/)CLAUDE\.md$/,
  /^\.claude\/settings[^/]*\.json$/,
  /^\.claude\/hooks\//,
  /^\.mcp\.json$/,
  // beads owns core.hooksPath: these are the repo's real git hooks.
  /^\.beads\/hooks\//,
  /^\.husky\//,
  /^\.githooks\//,
  /^lefthook\.ya?ml$/,
  /^\.pre-commit-config\.ya?ml$/,
];
const SWEEP_OWN = [/^tools\/sweep\//, /^\.claude\/skills\/sweep\//];

export interface LintOptions {
  /** Files allowed to name no bead yet; the first sweep empties the list. */
  unlinked?: string[];
}

export function lint(root: string, options: LintOptions = {}): string[] {
  const unlinked = options.unlinked ?? defaultUnlinked(root);
  const files = repoFiles(root);
  const read = (file: string) => readFileSync(path.join(root, file), "utf8");
  const prefix = beadPrefix(root);
  return [
    ...brokenLinks(root).map(({ file, target }) => `${file}: broken link ${target}`),
    ...missingBeads(files, unlinked, read, prefix),
    ...staleExceptions(root, unlinked, read, prefix),
    ...graphifyMentions(files, read),
  ].sort((a, b) => a.localeCompare(b));
}

type Read = (file: string) => string;

function missingBeads(files: string[], unlinked: string[], read: Read, prefix: string): string[] {
  return files
    .filter((file) => NEEDS_BEADS.test(file) && path.posix.basename(file) !== "CLAUDE.md")
    .filter((file) => classify(file) === "live" && !unlinked.includes(file))
    .filter((file) => !namesBead(read(file), prefix))
    .map((file) => `${file}: names no bead in its header (add a **Beads:** line)`);
}

// The exceptions list only shrinks: an entry that is gone, or now names its
// beads, must be removed.
function staleExceptions(root: string, unlinked: string[], read: Read, prefix: string): string[] {
  return unlinked
    .filter((file) => !existsSync(path.join(root, file)) || namesBead(read(file), prefix))
    .map(
      (file) => `${UNLINKED_FILE}: lists ${file}, which is gone or names its beads now; remove it`,
    );
}

function graphifyMentions(files: string[], read: Read): string[] {
  return files
    .filter((file) => AGENT_FILES.some((pattern) => pattern.test(file)))
    .filter((file) => !SWEEP_OWN.some((pattern) => pattern.test(file)))
    .filter((file) => /graphify/i.test(read(file)))
    .map((file) => `${file}: mentions graphify, which serves only the sweep (spec §13)`);
}

/** The bead IDs of `prefix` a file names in its header (the first 15 lines), once each. */
export function headerBeads(markdown: string, prefix: string = DEFAULT_PREFIX): string[] {
  const header = markdown.split("\n").slice(0, HEADER_LINES).join("\n");
  return [...new Set([...header.matchAll(beadIdPattern(prefix))].map((match) => match[0]))];
}

function namesBead(markdown: string, prefix: string): boolean {
  return headerBeads(markdown, prefix).length > 0;
}

function defaultUnlinked(root: string): string[] {
  const file = path.join(root, UNLINKED_FILE);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as string[]) : [];
}
