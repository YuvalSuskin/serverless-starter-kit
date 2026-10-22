// pnpm sweep snapshot: beads and memories as linked Markdown, so the graph
// indexes them like any doc and findings can cite them (spec §5 step 2).
// Links are written as if the snapshot sat at `snapshot/` in the repo's root,
// which is where the graph step stages it.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import type { Run } from "./exec.ts";

import { beadIdPattern, beadPrefix } from "./prefix.ts";
import { classify } from "./scope.ts";

interface Dependency {
  depends_on_id: string;
  type?: string;
}
interface Bead {
  _type?: string;
  id: string;
  title: string;
  status: string;
  issue_type?: string;
  labels?: string[];
  created_at?: string;
  updated_at?: string;
  parent?: string;
  description?: string;
  design?: string;
  acceptance_criteria?: string;
  notes?: string;
  close_reason?: string;
  dependencies?: Dependency[];
  comments?: Comment[];
}
interface Comment {
  author?: string;
  text: string;
  created_at?: string;
}

const SECTIONS: [keyof Bead, string][] = [
  ["description", "Description"],
  ["design", "Design"],
  ["acceptance_criteria", "Acceptance criteria"],
  ["notes", "Notes"],
  ["close_reason", "Close reason"],
];

// A repo path a bead names starts at a top-level folder and runs to the next
// space or quote; it may hold parentheses (Next.js route groups).
const PATH =
  /(?:\.claude|\.github|docs|design|frontend|backend|packages|tools|infra)\/[^\s`'"<>,;]+/g;
const WORD_BEFORE = /[\w./-]/;
const PRODUCT_ID = /\b[A-Z]{2,8}-[A-Z]{1,3}\d+\b/g;
const SHORT_ID = /\b[A-Z]{1,3}\d{1,3}\b/g;

export function snapshot(
  root: string,
  outDir: string,
  run: Run,
): { beads: number; memories: number } {
  // Every bd call happens before anything is written: a failure leaves no
  // partial snapshot.
  // One bd export holds every bead with its comments and dependencies; bd show
  // costs a third of a second per bead.
  const beads = run("bd", ["export"])
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Bead)
    .filter((bead) => bead._type === undefined || bead._type === "issue")
    // The sweep's own beads quote both sides of their findings: records, not sources.
    .filter((bead) => !(bead.labels ?? []).includes("sweep"))
    .filter((bead) => bead.status !== "closed" || (bead.labels ?? []).includes("decision"));
  // bd adds a numeric schema_version beside the memories.
  const memories = Object.fromEntries(
    Object.entries(JSON.parse(run("bd", ["memories", "--json"])) as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

  const ids = new Definitions(root, new Set(beads.map((bead) => bead.id)));
  const link = (text: string) => linkPaths(root, text);
  const files: Record<string, string> = {};
  const index: Record<string, string> = {};
  for (const bead of beads) {
    const file = `snapshot/beads/${bead.id}.md`;
    files[file] = beadMarkdown(bead, bead.comments ?? [], link, ids);
    index[file] = `bead:${bead.id}`;
  }
  for (const [key, text] of Object.entries(memories)) {
    const file = `snapshot/memories/${key}.md`;
    files[file] = withMentions(`# memory:${key}\n\n${link(text)}\n`, text, ids, null);
    index[file] = `memory:${key}`;
  }
  files["snapshot/index.json"] = `${JSON.stringify(index, null, 2)}\n`;
  writeWhole(outDir, files);
  return { beads: beads.length, memories: Object.keys(memories).length };
}

function beadMarkdown(
  bead: Bead,
  comments: Comment[],
  link: (text: string) => string,
  ids: Definitions,
): string {
  const deps = bead.dependencies ?? [];
  const parent = bead.parent ?? deps.find((d) => d.type === "parent-child")?.depends_on_id;
  const others = deps.filter((d) => d.type !== "parent-child");
  const header = [
    `# ${bead.id}: ${bead.title}`,
    "",
    `- id: ${bead.id}`,
    `- status: ${bead.status}`,
    bead.issue_type === undefined ? null : `- type: ${bead.issue_type}`,
    bead.labels?.length ? `- labels: ${bead.labels.join(", ")}` : null,
    bead.created_at === undefined ? null : `- created: ${bead.created_at}`,
    bead.updated_at === undefined ? null : `- updated: ${bead.updated_at}`,
    parent === undefined ? null : `- parent: ${ids.bead(parent)}`,
    others.length === 0
      ? null
      : `- depends on: ${others.map((d) => dependencyText(d, ids)).join(", ")}`,
  ].filter((line) => line !== null);

  const texts: string[] = [bead.title];
  const sections: string[] = [];
  for (const [field, heading] of SECTIONS) {
    const value = bead[field];
    if (typeof value !== "string" || value.trim() === "") continue;
    texts.push(value);
    sections.push(`## ${heading} (field: ${field})\n\n${link(value.trim())}`);
  }
  if (comments.length > 0) {
    texts.push(...comments.map((c) => c.text));
    const body = comments
      .map((c) => `### ${c.author ?? "unknown"}, ${c.created_at ?? ""}\n\n${link(c.text.trim())}`)
      .join("\n\n");
    sections.push(`## Comments (field: comments)\n\n${body}`);
  }
  const markdown = `${[header.join("\n"), ...sections].join("\n\n")}\n`;
  return withMentions(markdown, texts.join("\n"), ids, bead.id);
}

/**
 * Appends one line naming every decision, product and bead ID the text
 * mentions, once each, as a link to the file that defines it (a snapshot bead
 * by wikilink). IDs defined nowhere are left out: a link to nothing would
 * make a phantom node in the graph.
 */
function withMentions(
  markdown: string,
  text: string,
  ids: Definitions,
  self: string | null,
): string {
  const found = new Map<string, string>();
  for (const pattern of [PRODUCT_ID, SHORT_ID, ids.beadId]) {
    for (const match of text.matchAll(pattern)) {
      const id = match[0];
      const link = id === self ? undefined : ids.mention(id);
      if (link !== undefined) found.set(id, link);
    }
  }
  if (found.size === 0) return markdown;
  return `${markdown}\nMentions: ${[...found.values()].join(" ")}\n`;
}

/** Where each ID is defined: decision logs, product specs, and the beads in this snapshot. */
class Definitions {
  private readonly defined = new Map<string, string>();
  private readonly held: Set<string>;
  /** Matches the repo's own bead IDs. */
  readonly beadId: RegExp;

  constructor(root: string, held: Set<string>) {
    this.held = held;
    this.beadId = beadIdPattern(beadPrefix(root));
    const read = (dir: string, patterns: RegExp[]) => {
      const full = path.join(root, dir);
      if (!existsSync(full)) return;
      for (const name of readdirSync(full)
        .filter((n) => n.endsWith(".md"))
        .sort((a, b) => a.localeCompare(b))) {
        const text = readFileSync(path.join(full, name), "utf8");
        for (const pattern of patterns) {
          for (const match of text.matchAll(pattern)) {
            const id = match[1] ?? "";
            if (!this.defined.has(id)) this.defined.set(id, `${dir}/${name}`);
          }
        }
      }
    };
    // A table row's first cell, or a heading, defines a decision ID.
    read("docs/decisions", [/^\|\s*([A-Z]{1,3}\d{1,3})\s*\|/gm, /^#{2,4} ([A-Z]{1,3}\d{1,3})\b/gm]);
    // A bold lead ("**HOME-R23.**") or a table row defines a product ID.
    read("docs/product", [
      /^\*\*([A-Z]{2,8}-[A-Z]{1,3}\d+)\.?\*\*/gm,
      /^\|\s*\**([A-Z]{2,8}-[A-Z]{1,3}\d+)/gm,
    ]);
  }

  /** A bead as a wikilink when the snapshot holds it, else as plain text. */
  bead(id: string): string {
    return this.held.has(id) ? `[[${id}]]` : id;
  }

  mention(id: string): string | undefined {
    if (this.held.has(id)) return `[[${id}]]`;
    const file = this.defined.get(id);
    return file === undefined ? undefined : `[${id}](../../${file})`;
  }
}

function linkPaths(root: string, text: string): string {
  let out = "";
  let from = 0;
  for (const match of text.matchAll(PATH)) {
    const at = match.index;
    // Part of a longer word, or already a link's target: leave it.
    if (WORD_BEFORE.test(text[at - 1] ?? "") || text.slice(at - 2, at) === "](") continue;
    const file = trimPath(match[0]);
    // Only files the sweep reads join the graph; others stay plain text.
    if (!existsSync(path.join(root, file)) || classify(file) !== "live") continue;
    // Parentheses (Next.js route groups) go in angle brackets, so no parser
    // cuts the target at ")".
    const target = file.includes("(") ? `<../../${file}>` : `../../${file}`;
    const quoted = text[at - 1] === "`" && text[at + file.length] === "`";
    const start = quoted ? at - 1 : at;
    const end = quoted ? at + file.length + 1 : at + file.length;
    const label = quoted ? `\`${file}\`` : file;
    out += `${text.slice(from, start)}[${label}](${target})`;
    from = end;
  }
  return out + text.slice(from);
}

/** A path as written in prose: without the sentence's closing punctuation or an unmatched ")". */
function trimPath(found: string): string {
  let file = found;
  for (;;) {
    const last = file.at(-1);
    const unmatched = last === ")" && file.split("(").length < file.split(")").length;
    if (last !== "." && last !== ":" && !unmatched) return file;
    file = file.slice(0, -1);
  }
}

function dependencyText(dependency: Dependency, ids: Definitions): string {
  return `${ids.bead(dependency.depends_on_id)} (${dependency.type ?? "related"})`;
}

/** Writes the files into a fresh folder, then swaps it in for `<outDir>/snapshot`. */
function writeWhole(outDir: string, files: Record<string, string>): void {
  const temp = path.join(outDir, `.snapshot-${String(process.pid)}`);
  try {
    for (const [file, content] of Object.entries(files)) {
      const full = path.join(temp, file.replace(/^snapshot\//, ""));
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    rmSync(path.join(outDir, "snapshot"), { recursive: true, force: true });
    renameSync(temp, path.join(outDir, "snapshot"));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
