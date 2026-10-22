// pnpm sweep archive: which specs, plans and research are done by their
// beads, and moving them to docs/archive/ without breaking a link or a path
// mention (spec §10).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Run } from "./exec.ts";

import { findLinks, resolveLink } from "./links.ts";
import { headerBeads, UNLINKED_FILE } from "./lint.ts";
import { beadPrefix } from "./prefix.ts";
import { classify, liveFiles, repoFiles } from "./scope.ts";

export interface Candidate {
  files: string[];
  beads: string[];
  status: "candidate" | "live" | "unlinked";
  /** What still points at the group as its design: instructions, or a live header. */
  citedBy?: string[];
  /** IDs a header names that bd does not know. */
  unknownBeads?: string[];
}

interface Move {
  from: string;
  to: string;
}

type Read = (file: string) => string;

const ARCHIVABLE = /^docs\/(superpowers\/(specs|plans)|research)\/.+\.md$/;
// Instructions agents follow: a spec they name is a component's design.
const INSTRUCTIONS = [/(^|\/)CLAUDE\.md$/, /^\.claude\/skills\//];
const HEADER_LINES = 15;
// "backend spec §10.3": a spec named by its area.
const AREA_SPEC = /\b([a-z][a-z-]*) spec §\d/g;
// History keeps its words: mentions there are not rewritten (H6), links are.
const KEEPS_WORDS = [/^docs\/archive\//, /^docs\/reviews\//, /^docs\/decisions\//];
const TEXT_FILE = /\.(md|ts|tsx|mts|js|mjs|cjs|json|ya?ml|css|html|py|txt|toml)$/;

interface ExportedBead {
  id: string;
  status: string;
  dependencies?: { depends_on_id: string; type?: string }[];
}

const isArchivable = (file: string) =>
  ARCHIVABLE.test(file) && path.posix.basename(file) !== "CLAUDE.md";

export function candidates(root: string, run: Run): Candidate[] {
  const read: Read = (file) => readFileSync(path.join(root, file), "utf8");
  const files = liveFiles(root).filter(isArchivable);
  const prefix = beadPrefix(root);
  const status = beadStatuses(run);
  const instructions = liveFiles(root).filter((f) => INSTRUCTIONS.some((p) => p.test(f)));

  const cite = (candidate: Candidate, by: string[]): Candidate => {
    const citedBy = [...new Set([...(candidate.citedBy ?? []), ...by])].sort(byText);
    if (citedBy.length === 0) return candidate;
    const status = candidate.status === "unlinked" ? "unlinked" : "live";
    return { ...candidate, status, citedBy };
  };

  let result = groups(files, read).map((group): Candidate => {
    const named = [...new Set(group.flatMap((file) => headerBeads(read(file), prefix)))].sort(
      byText,
    );
    const beads = named.filter((id) => status.has(id));
    const unknown = named.filter((id) => !status.has(id));
    const extra = unknown.length > 0 ? { unknownBeads: unknown } : {};
    const base: Candidate = { files: group, beads, status: verdictOf(beads, status), ...extra };
    return cite(base, citingInstructions(group, instructions, read));
  });

  // A header that builds on a file keeps it live, unless the citing file is
  // itself being archived; one group kept live can keep another, so repeat
  // until nothing changes.
  for (;;) {
    const staying = result.filter((c) => c.status !== "candidate").flatMap((c) => c.files);
    const next = result.map((c) => cite(c, citingHeaders(c.files, staying, read)));
    const changed = next.some((c, index) => c.status !== result[index]?.status);
    result = next;
    if (!changed) break;
  }
  return result.sort((a, b) => byText(a.files[0] ?? "", b.files[0] ?? ""));
}

function verdictOf(beads: string[], done: Map<string, boolean>): Candidate["status"] {
  if (beads.length === 0) return "unlinked";
  return beads.every((id) => done.get(id) === true) ? "candidate" : "live";
}

function citingInstructions(group: string[], instructions: string[], read: Read): string[] {
  return instructions.filter((file) => {
    const text = read(file);
    const areas = [...text.matchAll(AREA_SPEC)].map((match) => match[1] ?? "");
    return group.some(
      (member) =>
        text.includes(member) ||
        (member.includes("/specs/") &&
          areas.some((area) => path.posix.basename(member).includes(`-${area}-`))),
    );
  });
}

function citingHeaders(group: string[], staying: string[], read: Read): string[] {
  return staying.filter((file) => {
    if (group.includes(file)) return false;
    const header = read(file).split("\n").slice(0, HEADER_LINES).join("\n");
    return group.some((member) => header.includes(path.posix.basename(member)));
  });
}

/** A plan and the spec its header names are one group; every other file is its own. */
function groups(files: string[], read: Read): string[][] {
  const partner = new Map<string, string>();
  for (const file of files.filter((f) => f.includes("/plans/"))) {
    const spec = specOf(file, read(file));
    if (spec !== undefined && files.includes(spec)) partner.set(spec, file);
  }
  const plans = new Set(partner.values());
  return files
    .filter((file) => !plans.has(file))
    .map((file) => {
      const plan = partner.get(file);
      return plan === undefined ? [file] : [plan, file].sort(byText);
    });
}

function specOf(plan: string, markdown: string): string | undefined {
  const line = markdown.split("\n").find((l) => l.startsWith("**Spec:**"));
  if (line === undefined) return undefined;
  const linked = findLinks(line)
    .map((link) => resolveLink(plan, link.target))
    .find((target) => target !== null);
  return linked ?? /`(docs\/superpowers\/specs\/[^`]+\.md)`/.exec(line)?.[1];
}

/** Each bead's "done": closed, and every descendant closed. */
function beadStatuses(run: Run): Map<string, boolean> {
  const beads = run("bd", ["export"])
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as ExportedBead);
  const children = new Map<string, string[]>();
  for (const bead of beads) {
    for (const dep of bead.dependencies ?? []) {
      if (dep.type !== "parent-child") continue;
      children.set(dep.depends_on_id, [...(children.get(dep.depends_on_id) ?? []), bead.id]);
    }
  }
  const closed = new Map(beads.map((bead) => [bead.id, bead.status === "closed"]));
  const done = (id: string, seen: Set<string>): boolean => {
    if (seen.has(id)) return true;
    seen.add(id);
    return (
      (closed.get(id) ?? false) && (children.get(id) ?? []).every((child) => done(child, seen))
    );
  };
  return new Map(beads.map((bead) => [bead.id, done(bead.id, new Set())]));
}

/**
 * Moves each file to docs/archive/ at the same path, then rewrites every link
 * and path mention, and drops the moved files from the lint's exceptions.
 * Refuses a home, a file outside the live set, and a file still cited as a
 * design; throws if an old path survives where it should have been rewritten.
 */
export function archivePaths(root: string, paths: string[], run: Run): Move[] {
  const read: Read = (file) => readFileSync(path.join(root, file), "utf8");
  const live = liveFiles(root);
  const instructions = live.filter((f) => INSTRUCTIONS.some((p) => p.test(f)));
  const staying = live.filter((f) => isArchivable(f) && !paths.includes(f));
  for (const file of paths) {
    if (!isArchivable(file) || !live.includes(file)) {
      throw new Error(`${file} cannot be archived: only live specs, plans and research can`);
    }
    const cited = [
      ...citingInstructions([file], instructions, read),
      ...citingHeaders([file], staying, read),
    ];
    if (cited.length > 0) {
      throw new Error(`${file} cannot be archived: cited by ${cited.join(", ")}`);
    }
  }
  const moves = paths.map((from) => ({ from, to: from.replace(/^docs\//, "docs/archive/") }));
  for (const { from, to } of moves) {
    mkdirSync(path.join(root, path.posix.dirname(to)), { recursive: true });
    run("git", ["mv", from, to], { cwd: root });
  }
  dropExceptions(root, paths);
  rewriteAll(root, moves);
  const left = repoFiles(root).filter(
    (file) =>
      TEXT_FILE.test(file) &&
      rewritesWords(file) &&
      moves.some(({ from }) => outsideFences(read(file)).includes(from)),
  );
  if (left.length > 0) throw new Error(`Old paths remain in: ${left.join(", ")}`);
  return moves;
}

const rewritesWords = (file: string) =>
  classify(file) !== "out" && !KEEPS_WORDS.some((pattern) => pattern.test(file));

/** Links everywhere the sweep reads; path mentions outside history and fenced code. */
function rewriteAll(root: string, moves: Move[]): void {
  const forward = new Map(moves.map((move) => [move.from, move.to]));
  const back = new Map(moves.map((move) => [move.to, move.from]));
  for (const file of repoFiles(root)) {
    if (!TEXT_FILE.test(file) || classify(file) === "out") continue;
    const text = readFileSync(path.join(root, file), "utf8");
    let next = file.endsWith(".md")
      ? rewriteFileLinks(text, file, back.get(file) ?? file, forward)
      : text;
    if (rewritesWords(file)) next = rewriteMentions(next, forward, file.endsWith(".md"));
    if (next !== text) writeFileSync(path.join(root, file), next);
  }
}

/** One file's relative links, resolved from where it stood (`before`) and written from where it is. */
function rewriteFileLinks(
  text: string,
  file: string,
  before: string,
  forward: Map<string, string>,
): string {
  let out = "";
  let from = 0;
  for (const link of findLinks(text)) {
    const resolved = resolveLink(before, link.target);
    if (resolved === null) continue;
    const target = forward.get(resolved) ?? resolved;
    if (target === resolved && before === file) continue;
    const suffix = link.target.slice(link.target.search(/[#?]|$/));
    const rewritten = link.target.startsWith("/")
      ? `/${target}`
      : path.posix.relative(path.posix.dirname(file), target);
    out += text.slice(from, link.index) + rewritten + suffix;
    from = link.index + link.length;
  }
  return out + text.slice(from);
}

/** Every mention of a moved path; in Markdown, never inside fenced code. */
function rewriteMentions(text: string, forward: Map<string, string>, markdown: boolean): string {
  const replace = (part: string) => {
    let next = part;
    for (const [old, now] of forward) next = next.split(old).join(now);
    return next;
  };
  if (!markdown) return replace(text);
  return segments(text)
    .map((segment) => (segment.fenced ? segment.text : replace(segment.text)))
    .join("");
}

function outsideFences(text: string): string {
  return segments(text)
    .filter((segment) => !segment.fenced)
    .map((segment) => segment.text)
    .join("");
}

/** Markdown split into fenced and unfenced runs of whole lines. */
function segments(text: string): { text: string; fenced: boolean }[] {
  const out: { text: string; fenced: boolean }[] = [];
  let fence: string | null = null;
  for (const line of text.split(/(?<=\n)/)) {
    const opener = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    const inside = fence !== null;
    if (inside && opener?.startsWith(fence ?? "")) fence = null;
    else if (!inside && opener !== undefined) fence = opener;
    const fenced = inside || fence !== null;
    const last = out.at(-1);
    if (last?.fenced === fenced) last.text += line;
    else out.push({ text: line, fenced });
  }
  return out;
}

function dropExceptions(root: string, moved: string[]): void {
  const file = path.join(root, UNLINKED_FILE);
  if (!existsSync(file)) return;
  const list = JSON.parse(readFileSync(file, "utf8")) as string[];
  const kept = list.filter((entry) => !moved.includes(entry));
  if (kept.length !== list.length) writeFileSync(file, `${JSON.stringify(kept, null, 2)}\n`);
}

function byText(a: string, b: string): number {
  return a.localeCompare(b);
}
