// The template's harness (skills, agents, seed memories) names no project: no
// first-project name, no Hebrew, and no path to a file that is not there. This
// reads the real repo, so turbo.json makes `.claude/**` an input of this test.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO = path.join(import.meta.dirname, "../../..");
const SKILLS = path.join(REPO, ".claude/skills");
const AGENTS = path.join(REPO, ".claude/agents");
const HEBREW = /\p{Script=Hebrew}/u;
const TEXT_FILE = /\.(md|mjs|js|ts|tsx|css|html|json|ya?ml|txt|snap)$/;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

const harnessFiles = [...filesUnder(SKILLS), ...filesUnder(AGENTS)].filter((f) =>
  TEXT_FILE.test(f),
);
const relative = (file: string) => path.relative(REPO, file);

// The competitors tool ships synthetic data only: no Hebrew, no first-project
// competitor, no shekel sign.
const COMPETITORS_SRC = path.join(REPO, "tools/competitors/src");
const competitorFiles = filesUnder(COMPETITORS_SRC).filter((f) => TEXT_FILE.test(f));

describe("every skill and agent", () => {
  it("finds the skills it checks", () => {
    expect(harnessFiles.length).toBeGreaterThan(20);
    expect(harnessFiles.some((f) => f.endsWith("product-spec/SKILL.md"))).toBe(true);
    expect(harnessFiles.some((f) => f.endsWith("design-researcher.md"))).toBe(true);
  });

  it("names no first project", () => {
    const named = harnessFiles.filter((f) =>
      /kalivent|picime|picme|iplan|mit4mit/i.test(readFileSync(f, "utf8")),
    );
    expect(named.map(relative)).toEqual([]);
  });

  it("holds no Hebrew", () => {
    const hebrew = harnessFiles.filter((f) => HEBREW.test(readFileSync(f, "utf8")));
    expect(hebrew.map(relative)).toEqual([]);
  });

  // `docs/competitors/` is the data folder `pnpm competitors` owns: a skill may
  // name what the tool lays out there (a competitor's slug folder, the
  // taxonomy, the landscape) but not the first project's own files or
  // competitors.
  it("names only the competitors folder's own layout under docs/competitors/", () => {
    const layout = /^(<slug>|\*|taxonomy|landscape\.md|)$/;
    const stray: string[] = [];
    for (const file of harnessFiles) {
      for (const match of readFileSync(file, "utf8").matchAll(
        /docs\/competitors\/([^\s`)\],;:]*)/g,
      )) {
        const first = (match[1] ?? "").split("/")[0]?.replace(/\.$/, "") ?? "";
        if (!layout.test(first)) stray.push(`${relative(file)}: ${match[0]}`);
      }
    }
    expect(stray).toEqual([]);
  });

  // A path in backticks that a skill sends the reader to must exist, unless it
  // is a pattern (<feature>, *, a date) or a file the work itself creates.
  // The rows of the bootstrap's step 6 table list the skeleton's files, which
  // that step deletes (tools/bootstrap/src/skill.test.ts checks that list
  // against the repo); the rest of that file is checked like any other.
  it("points only at files that exist", () => {
    const created = /^docs\/(archive|competitors|reviews|sweeps)(\/|$)/;
    const skeletonList = (file: string, line: string) =>
      file.endsWith("bootstrap/steps/6-replace-skeleton.md") && line.startsWith("| `");
    const dangling: string[] = [];
    for (const file of harnessFiles.filter((f) => f.endsWith(".md"))) {
      const text = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => !skeletonList(file, line))
        .join("\n");
      for (const match of text.matchAll(
        /`((?:docs|tools|design|frontend|backend|deploy|infra|packages|\.claude)\/[A-Za-z0-9_./-]+)`/g,
      )) {
        const target = match[1] ?? "";
        if (created.test(target) || /\bYYYY|\bNNN/.test(target)) continue;
        if (!existsSync(path.join(REPO, target))) dangling.push(`${relative(file)}: ${target}`);
      }
    }
    expect(dangling).toEqual([]);
  });
});

describe("tools/competitors' tests and fixtures", () => {
  it("finds the files it checks", () => {
    expect(competitorFiles.length).toBeGreaterThan(30);
  });

  it("hold no Hebrew and no shekel sign", () => {
    const found = competitorFiles.filter((f) =>
      /\p{Script=Hebrew}|\u20AA/u.test(readFileSync(f, "utf8")),
    );
    expect(found.map(relative)).toEqual([]);
  });

  it("name no first-project competitor", () => {
    const found = competitorFiles.filter((f) =>
      /picime|picme|iplan|mit4mit/i.test(readFileSync(f, "utf8")),
    );
    expect(found.map(relative)).toEqual([]);
  });
});
