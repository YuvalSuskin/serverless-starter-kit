// The rename (design §5): turns the template, named by the placeholder `acme`,
// into a named project. It rewrites the placeholder in tracked text files,
// renames tracked paths that hold it, and deletes the marker that says "not
// yet renamed". Everything is computed first and checked against the
// allowlist; a refusal changes nothing.
//
// This file is on its own allowlist: it names the placeholder, and the
// bootstrap deletes it once the project is named.
import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync, realpathSync, rmdirSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const PLACEHOLDER = "acme";

/** The root file whose presence means "the template, not yet renamed". */
export const MARKER = `.${PLACEHOLDER}-template`;

/**
 * Claude Code's SessionStart hook in `.claude/settings.json`. In a fresh copy
 * (the marker, and no tracker database under `.beads/` yet, embedded or
 * server mode) it skips `bd prime`, which would create an empty one (TB130,
 * TB137); the template's own checkout keeps the marker and has a database, so
 * its sessions are primed. The rename deletes the marker and turns the hook
 * into `PRIME`, so a named project primes every session.
 */
export const PRIME = "bd prime --hook-json";
export const PRIME_GUARDED = `{ test -e "$CLAUDE_PROJECT_DIR/${MARKER}" && ! test -e "$CLAUDE_PROJECT_DIR/.beads/embeddeddolt" && ! test -e "$CLAUDE_PROJECT_DIR/.beads/dolt"; } || ${PRIME}`;
const SETTINGS = ".claude/settings.json";

/** The settings file with the guarded hook made plain; the JSON text is edited, not re-serialised. */
function unguardHook(text: string): string {
  return text.replaceAll(JSON.stringify(PRIME_GUARDED), JSON.stringify(PRIME));
}

export interface ProjectName {
  /** Lowercase: the npm scope, the root package, the bead prefix, AWS names. */
  slug: string;
  /** What people read: page titles, the sender's name, prose. */
  display: string;
}

type ReplacementKind =
  | "appInitial"
  | "beads"
  | "envVar"
  | "invalidDomain"
  | "lintPlugin"
  | "localhost"
  | "lowercase"
  | "pathSegment"
  | "prose"
  | "rootPackage"
  | "scope"
  | "snake"
  | "uppercase";

export interface RenameReport {
  /** Tracked files whose content or path changed. */
  filesChanged: number;
  replacements: Record<ReplacementKind, number>;
  renamedPaths: { from: string; to: string }[];
  /** Third-party package names holding the placeholder, left as they are. */
  thirdParty: string[];
}

export class RenameRefused extends Error {
  override name = "RenameRefused";
}

/** Files that keep the placeholder after a rename, and why. */
interface Allowed {
  path: RegExp;
  reason: string;
  /** Holds only until `pnpm install` has run. */
  untilInstall?: true;
}

const ALLOWLIST: readonly Allowed[] = [
  {
    path: /^docs\/decisions\/2026-10-21-template-build-decisions\.md$/,
    reason: "the template's build log records the placeholder itself",
  },
  {
    path: /^\.claude\/skills\/shadcn\//,
    reason:
      "a vendored upstream skill (skills-lock.json pins its hash); its @acme is shadcn's example registry, not this project",
  },
  {
    path: /^tools\/bootstrap\/src\/rename(?:\.test)?\.ts$/,
    reason: "the rename and its tests name the placeholder; the bootstrap deletes them once done",
  },
  {
    path: /^pnpm-lock\.yaml$/,
    reason: "never edited: pnpm install regenerates it right after the rename",
    untilInstall: true,
  },
];

const HIT = /acme/i;

const SLUG = /^[a-z][a-z0-9-]{0,49}$/;
// Letters and digits in any script, inner spaces, dots and hyphens: a name
// that is safe inside every string it lands in (TS, JSON, YAML, Python's
// %-format, a mail header's display name).
const DISPLAY = /^[\p{L}\p{N}](?:[\p{L}\p{N} .-]{0,48}[\p{L}\p{N}.])?$/u;

function validate(name: ProjectName): void {
  const { display, slug } = name;
  if (!SLUG.test(slug) || slug.endsWith("-") || slug.includes("--")) {
    throw new RenameRefused(
      `"${slug}" is not a slug: lowercase letters, digits and single inner hyphens, starting with a letter, at most 50 characters (for example my-shop)`,
    );
  }
  if (HIT.test(slug)) {
    throw new RenameRefused(
      `the slug "${slug}" holds the placeholder "${PLACEHOLDER}"; choose another`,
    );
  }
  if (HIT.test(display)) {
    throw new RenameRefused(
      `the display name "${display}" holds the placeholder "${PLACEHOLDER}"; choose another`,
    );
  }
  if (!DISPLAY.test(display)) {
    throw new RenameRefused(
      `"${display}" is not a display name: letters, digits, inner spaces, dots and hyphens, at most 50 characters (for example "My Shop")`,
    );
  }
}

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const nulList = (out: string) => out.split("\0").filter((entry) => entry !== "");

function preconditions(root: string): void {
  let top: string;
  try {
    top = git(root, ["rev-parse", "--show-toplevel"]).trim();
  } catch {
    throw new RenameRefused(`${root} is not a git repository`);
  }
  if (realpathSync(top) !== realpathSync(root)) {
    throw new RenameRefused(`${root} is not the top of its git repository (${top})`);
  }
  if (lstatSync(path.join(root, MARKER), { throwIfNoEntry: false }) === undefined) {
    throw new RenameRefused(
      `${MARKER} is missing: this repo was already renamed, or is not the template`,
    );
  }
  // A copy made without history (`rm -rf .git && git init`) tracks nothing,
  // and the rename reads `git ls-files`: it would change no file, yet delete
  // the marker and start the tracker.
  try {
    git(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  } catch {
    throw new RenameRefused(
      "this repository has no commit: run `git add -A && git commit -m 'Initial commit from template'` first",
    );
  }
  if (nulList(git(root, ["ls-files", "-z", "--", MARKER])).length === 0) {
    throw new RenameRefused(
      `${MARKER} is not committed: commit the template's files (git add -A && git commit) before the rename`,
    );
  }
  const dirty = git(root, ["status", "--porcelain", "--untracked-files=no"]);
  if (dirty !== "") {
    throw new RenameRefused(
      `the tree has uncommitted changes; commit or stash them first:\n${dirty}`,
    );
  }
}

// --- What a placeholder becomes ----------------------------------------------

interface Forms {
  display: string;
  slug: string;
  /** For identifiers and names that cannot hold a hyphen. */
  snake: string;
  upper: string;
}

function formsOf(name: ProjectName): Forms {
  const snake = name.slug.replaceAll("-", "_");
  return { display: name.display, slug: name.slug, snake, upper: snake.toUpperCase() };
}

interface Rule {
  kind: ReplacementKind;
  /** Only files this matches (repo-relative); all when absent. */
  file?: RegExp;
  pattern: RegExp;
  to: (f: Forms) => string;
}

// Not glued to a letter or digit on the left (`\n` and friends in a string
// literal end in a letter but are not one), nor on the right.
const L = String.raw`(?:(?<![A-Za-z0-9])|(?<=\\[nrt]))`;
const R = "(?![A-Za-z0-9])";
const re = (source: string) => new RegExp(source, "g");
const SNAKE = `(?<=_)acme${R}|${L}acme(?=_)`;

// In order: the specific forms first, then the bare word by its case.
const RULES: readonly Rule[] = [
  // TB35: the deploy role's grants match `${AppInitial}*`; the README passes the letter.
  { kind: "appInitial", pattern: /AppInitial=a\b/g, to: (f) => `AppInitial=${f.slug.charAt(0)}` },
  {
    kind: "appInitial",
    pattern: /\(acme: a\)/g,
    to: (f) => `(${f.slug}: ${f.slug.charAt(0)})`,
  },
  {
    kind: "appInitial",
    pattern: /"ac-dev-", "a-dev-"/g,
    to: (f) => {
      const two = f.slug.slice(0, 2).replace(/-$/, "");
      const one = f.slug.charAt(0);
      return two === one ? `"${one}-dev-"` : `"${two}-dev-", "${one}-dev-"`;
    },
  },
  {
    file: /^\.beads\/config\.yaml$/,
    kind: "beads",
    pattern: /^issue-prefix:[ \t]*["']?acme["']?[ \t]*$/gm,
    to: (f) => `issue-prefix: ${f.slug}`,
  },
  {
    file: /^package\.json$/,
    kind: "rootPackage",
    pattern: /(?<=^\s*"name":\s*")acme(?=",?$)/gm,
    to: (f) => f.slug,
  },
  // An ESLint plugin's namespace is an object key: quoted if it has a hyphen.
  {
    kind: "lintPlugin",
    pattern: /(?<=plugins: \{ )acme(?=: )/g,
    to: (f) => (f.slug.includes("-") ? `"${f.slug}"` : f.slug),
  },
  { kind: "scope", pattern: re(`${L}@acme/`), to: (f) => `@${f.slug}/` },
  { kind: "envVar", pattern: /(?<!\w)ACME_(?=[A-Z0-9])/g, to: (f) => `${f.upper}_` },
  { kind: "invalidDomain", pattern: re(`${L}acme\\.invalid${R}`), to: (f) => `${f.slug}.invalid` },
  { kind: "localhost", pattern: re(`${L}acme\\.localhost${R}`), to: (f) => `${f.slug}.localhost` },
  { kind: "pathSegment", pattern: /\/acme\//g, to: (f) => `/${f.slug}/` },
  { kind: "snake", pattern: re(SNAKE), to: (f) => f.snake },
  { kind: "uppercase", pattern: re(`${L}ACME${R}`), to: (f) => f.upper },
  { kind: "prose", pattern: re(`${L}Acme${R}`), to: (f) => f.display },
  { kind: "lowercase", pattern: re(`${L}acme${R}`), to: (f) => f.slug },
];

type Counts = Record<ReplacementKind, number>;

const emptyCounts = (): Counts => Object.fromEntries(RULES.map((rule) => [rule.kind, 0])) as Counts;

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

/** A manifest's dependency names, or none if it does not parse. */
function dependencyNames(file: string): string[] {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return [];
  }
  return DEPENDENCY_FIELDS.flatMap((field) => {
    const deps = json[field];
    return typeof deps === "object" && deps !== null ? Object.keys(deps) : [];
  });
}

/** Third-party package names that hold the placeholder: dependencies outside our scope. */
function thirdPartyNames(root: string, manifests: string[]): string[] {
  const names = manifests
    .flatMap((file) => dependencyNames(path.join(root, file)))
    .filter((dep) => HIT.test(dep) && !dep.startsWith("@acme/"));
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

const escapeRe = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Swaps each third-party name for a placeholder-free token, and back. */
function masker(names: string[]): {
  hide: (text: string) => string;
  show: (text: string) => string;
} {
  const masks = names.map((name, i) => ({
    name,
    pattern: new RegExp(`(?<![\\w@/.-])${escapeRe(name)}(?![\\w-])`, "g"),
    token: `\u0000${String(i)}\u0000`,
  }));
  return {
    hide: (text) => masks.reduce((t, m) => t.replace(m.pattern, m.token), text),
    show: (text) => masks.reduce((t, m) => t.replaceAll(m.token, m.name), text),
  };
}

function rewrite(file: string, text: string, forms: Forms, counts: Counts): string {
  let out = text;
  for (const rule of RULES) {
    if (rule.file !== undefined && !rule.file.test(file)) continue;
    out = out.replace(rule.pattern, () => {
      counts[rule.kind] += 1;
      return rule.to(forms);
    });
  }
  return out;
}

/** The database is named after the prefix, without hyphens (bd's embedded Dolt refuses them). */
function rewriteMetadata(text: string, forms: Forms, counts: Counts): string {
  const json = JSON.parse(text) as Record<string, unknown>;
  if (json.dolt_database === PLACEHOLDER) {
    json.dolt_database = forms.snake;
    counts.beads += 1;
  }
  // The template tracker's identity; bd init gives the project its own.
  delete json.project_id;
  return `${JSON.stringify(json, null, 2)}${text.endsWith("\n") ? "\n" : ""}`;
}

/** Path segments: the slug, and a display name without its spaces. */
function renamePath(file: string, forms: Forms): string {
  return file
    .split("/")
    .map((segment) =>
      segment
        .replace(re(`${L}ACME${R}`), forms.upper)
        .replace(re(`${L}Acme${R}`), forms.display.replaceAll(" ", ""))
        .replace(re(SNAKE), forms.snake)
        .replace(re(`${L}acme${R}`), forms.slug),
    )
    .join("/");
}

const allowed = (file: string, installed: boolean) =>
  ALLOWLIST.some((entry) => entry.path.test(file) && !(installed && entry.untilInstall));

export interface Leftover {
  file: string;
  line: number;
  text: string;
}

function hitsIn(file: string, text: string, thirdParty: string[]): Leftover[] {
  const { hide } = masker(thirdParty);
  return text
    .split("\n")
    .flatMap((line, i) => (HIT.test(hide(line)) ? [{ file, line: i + 1, text: line.trim() }] : []));
}

function grepFiles(root: string): string[] {
  try {
    return nulList(git(root, ["grep", "-z", "-I", "-l", "-i", PLACEHOLDER, "--", "."]));
  } catch (error) {
    // git grep exits 1 when nothing matches.
    if ((error as { status?: number }).status === 1) return [];
    throw error;
  }
}

/**
 * Lines of tracked text files that still hold the placeholder, outside the
 * allowlist and third-party names. `installed`: pnpm install has run, so the
 * lockfile must be clean too.
 */
export function leftovers(root: string, opts: { installed: boolean }): Leftover[] {
  const manifests = nulList(git(root, ["ls-files", "-z", "--", "package.json", "*/package.json"]));
  const thirdParty = thirdPartyNames(root, manifests);
  return grepFiles(root)
    .filter((file) => !allowed(file, opts.installed))
    .flatMap((file) => hitsIn(file, readFileSync(path.join(root, file), "utf8"), thirdParty));
}

const isBinary = (bytes: Buffer) => bytes.subarray(0, 8000).includes(0);

function removeEmptyDirs(root: string, dir: string): void {
  for (let current = dir; current !== "." && current !== ""; current = path.dirname(current)) {
    const full = path.join(root, current);
    if (readdirSync(full).length > 0) return;
    rmdirSync(full);
  }
}

interface Change {
  from: string;
  text: string | undefined;
  to: string;
}

interface Plan {
  changes: Change[];
  problems: Leftover[];
  thirdParty: string[];
}

/** One tracked file's new path and text, adding what would be left over to `found`. */
function planFile(
  root: string,
  file: string,
  ctx: { counts: Counts; forms: Forms; mask: ReturnType<typeof masker>; thirdParty: string[] },
  found: Plan,
): void {
  const full = path.join(root, file);
  // Files only: never a symlink, a submodule or a deleted path.
  if (file === MARKER || lstatSync(full, { throwIfNoEntry: false })?.isFile() !== true) return;
  const to = renamePath(file, ctx.forms);
  if (HIT.test(to)) found.problems.push({ file, line: 0, text: `its path would become ${to}` });

  let text: string | undefined;
  const bytes = allowed(file, false) ? undefined : readFileSync(full);
  // Every text file: the AppInitial letter can sit in one that names no placeholder.
  if (bytes !== undefined && !isBinary(bytes)) {
    const before = bytes.toString("utf8");
    const source = file === SETTINGS ? unguardHook(before) : before;
    const after =
      file === ".beads/metadata.json"
        ? rewriteMetadata(source, ctx.forms, ctx.counts)
        : ctx.mask.show(rewrite(file, ctx.mask.hide(source), ctx.forms, ctx.counts));
    found.problems.push(...hitsIn(file, after, ctx.thirdParty));
    if (after !== before) text = after;
  }
  if (to !== file || text !== undefined) found.changes.push({ from: file, text, to });
}

/** What the rename would change, and what it would leave outside the allowlist. */
function plan(root: string, forms: Forms, counts: Counts): Plan {
  const tracked = nulList(git(root, ["ls-files", "-z"]));
  const thirdParty = thirdPartyNames(
    root,
    tracked.filter((file) => path.basename(file) === "package.json"),
  );
  const found: Plan = { changes: [], problems: [], thirdParty };
  const ctx = { counts, forms, mask: masker(thirdParty), thirdParty };
  for (const file of tracked) planFile(root, file, ctx, found);
  return found;
}

/** Renames the template at `root` to `name`. Refuses, changing nothing, unless every check passes. */
export async function renameProject(root: string, name: ProjectName): Promise<RenameReport> {
  validate(name);
  preconditions(root);
  const counts = emptyCounts();
  const { changes, problems, thirdParty } = plan(root, formsOf(name), counts);

  if (problems.length > 0) {
    const list = problems.map((p) => `  ${p.file}:${String(p.line)}: ${p.text}`).join("\n");
    throw new RenameRefused(
      `the placeholder would be left here, outside the allowlist in tools/bootstrap/src/rename.ts; nothing was changed:\n${list}`,
    );
  }

  for (const change of changes) {
    const to = path.join(root, change.to);
    if (change.to !== change.from) {
      await mkdir(path.dirname(to), { recursive: true });
      await rename(path.join(root, change.from), to);
      removeEmptyDirs(root, path.dirname(change.from));
    }
    if (change.text !== undefined) await writeFile(to, change.text);
  }
  await rm(path.join(root, MARKER));

  return {
    filesChanged: changes.length,
    renamedPaths: changes
      .filter((change) => change.to !== change.from)
      .map(({ from, to }) => ({ from, to })),
    replacements: counts,
    thirdParty,
  };
}
