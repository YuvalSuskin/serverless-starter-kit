// The bootstrap's fill tokens: `.claude/skills/bootstrap/fills.json` lists
// every placeholder a bootstrap step fills, keyed by the exact token, with the
// step that fills it and the files that carry it (TB87). Until that step is
// done every listed file carries the token, and no other file does; once it
// is done, none does. Reads the real repo.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseState, type StepId, STEPS } from "./bootstrap-state.ts";

const REPO = path.join(import.meta.dirname, "../../..");
const SKILL = ".claude/skills/bootstrap";
const STATE_FILE = path.join(REPO, ".bootstrap/state.json");
// This log records how the template was built, tokens included; it talks
// about them rather than carries them.
const TEMPLATE_LOG = "docs/decisions/2026-10-21-template-build-decisions.md";

interface Fill {
  step: StepId;
  files: string[];
}

const read = (file: string) => readFileSync(path.join(REPO, file), "utf8");
const fills = JSON.parse(read(`${SKILL}/fills.json`)) as Record<string, Fill>;
const state = parseState(
  existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, "utf8")) as unknown) : undefined,
);
const sorted = (list: string[]) => list.toSorted((a, b) => a.localeCompare(b));
const git = (args: string[]) =>
  execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter(Boolean);

/** Tests, this log and the bootstrap's own files talk about a token; they never carry one. */
const talksAbout = (file: string) =>
  file.endsWith(".test.ts") || file === TEMPLATE_LOG || file.startsWith(`${SKILL}/`);

function holders(token: string): string[] {
  let found: string[];
  try {
    found = git(["grep", "-l", "-F", token]);
  } catch {
    found = []; // git grep exits 1 when nothing matches
  }
  return sorted(found.filter((file) => !talksAbout(file)));
}

// Where the steps' placeholders live: the platform, the deploy docs, the
// runbooks, the kept decisions, the root rules and the seed memories. Every
// `<token>` there is a fill or one of the doc syntax below.
const SCOPE = [
  /^infra\//,
  /^deploy\/.*\.(md|json|ya?ml)$/,
  /^docs\/runbooks\//,
  /^docs\/decisions\//,
  /^CLAUDE\.md$/,
  /^\.beads\/seed-memories\.json$/,
];

// Angle brackets that stand for "a value you supply when you run this", or an
// HTML tag: never filled by the bootstrap (TB103).
const DOC_SYNTAX = new Set([
  "<app>",
  "<area>",
  "<bead-id>",
  "<branch>",
  "<bucket>",
  "<command>",
  "<date>",
  "<description>",
  "<file>",
  "<head>",
  "<id>",
  "<initial>",
  "<ip>",
  "<key>",
  "<kind>",
  "<lang>",
  "<link>",
  "<locale>",
  "<n>",
  "<name>",
  "<new>",
  "<old-id>",
  "<old>",
  "<other-region>",
  "<owner-id>",
  "<path>",
  "<pillar>",
  "<port>",
  "<pr>",
  "<ref>",
  "<round>",
  "<s>",
  "<sha>",
  "<slug>",
  "<stage>",
  "<subapp>",
  "<target>",
  "<url>",
  "<web>",
  "<word>",
]);

// The tokens the brief and the seed memories require a step to fill.
const REQUIRED = [
  "<billing-unit>",
  "<dev-account-id>",
  "<dev-stage-name>",
  "<domain>",
  "<owner-inbox-url>",
  "<platform-resources>",
  "<prod-account-id>",
  "<project>",
  "<project-account>",
  "<region>",
  "<registrar-exception>",
];

describe("fills.json", () => {
  it("is keyed by token, each with the step that fills it and the files that carry it", () => {
    expect(Object.keys(fills).length).toBeGreaterThan(0);
    const malformed = Object.entries(fills).filter(
      ([token, fill]) =>
        !/^<[a-z][a-z0-9-]*>$/.test(token) ||
        !(STEPS as readonly string[]).includes(fill.step) ||
        fill.files.length === 0 ||
        JSON.stringify(fill.files) !== JSON.stringify(sorted([...new Set(fill.files)])),
    );
    // Each: a token, a step, and its files sorted, each once.
    expect(malformed).toEqual([]);
  });

  it("lists every file that carries a token until its step fills it, and none after", () => {
    const wrong = Object.entries(fills).flatMap(([token, fill]) => {
      const expected = state.steps[fill.step]?.status === "done" ? [] : fill.files;
      const found = holders(token);
      return JSON.stringify(found) === JSON.stringify(expected)
        ? []
        : [{ token, step: fill.step, listed: expected, found }];
    });
    expect(wrong).toEqual([]);
  });

  it("holds every token the steps must fill", () => {
    const memories = read(".beads/seed-memories.json").match(/<[a-z][a-z0-9-]*>/g) ?? [];
    const missing = [...new Set([...REQUIRED, ...memories])].filter((token) => !(token in fills));
    expect(missing).toEqual([]);
  });

  it("names each token in the step file that fills it", () => {
    const unnamed = Object.entries(fills)
      .filter(([token, fill]) => !read(`${SKILL}/steps/${fill.step}.md`).includes(token))
      .map(([token, fill]) => `${fill.step}: ${token}`);
    expect(unnamed).toEqual([]);
  });

  it("covers every placeholder in the platform, deploy and decision docs, or names it doc syntax", () => {
    const files = git(["ls-files"]).filter(
      (file) => SCOPE.some((pattern) => pattern.test(file)) && !talksAbout(file),
    );
    expect(files.length).toBeGreaterThan(20);
    const unclassified = new Set<string>();
    for (const file of files) {
      for (const [token] of read(file).matchAll(/<[a-z][a-z0-9-]*>/g)) {
        if (!(token in fills) && !DOC_SYNTAX.has(token)) unclassified.add(`${file}: ${token}`);
      }
    }
    expect([...unclassified]).toEqual([]);
    expect(Object.keys(fills).filter((token) => DOC_SYNTAX.has(token))).toEqual([]);
  });
});
