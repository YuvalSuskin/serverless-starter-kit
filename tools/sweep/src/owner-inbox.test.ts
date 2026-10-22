// The owner inbox as a built-in practice: the page's source holds no item, no
// project name and no external request; the skill and the rule point at one
// placeholder, `<owner-inbox-url>`, that the bootstrap fills.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { realRun } from "./exec.ts";

const REPO = path.join(import.meta.dirname, "../../..");
const SKILL_DIR = path.join(REPO, ".claude/skills/owner-inbox");
const PAGE = path.join(SKILL_DIR, "page.html");
const SKILL = path.join(SKILL_DIR, "SKILL.md");
const FILLS = path.join(REPO, ".claude/skills/bootstrap/fills.json");
const PLACEHOLDER = "<owner-inbox-url>";
const INBOX_URL = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[\w-]+/;
const INBOX_URL_OR_PLACEHOLDER = new RegExp(`${PLACEHOLDER}|${INBOX_URL.source}`);
// What step 3 writes: an invented id, the shape the Artifact tool returns.
const EXAMPLE_URL = "https://claude.ai/artifact/ExampleInboxPage0000";
// Split, so this file does not hold the id it looks for.
const FIRST_PROJECT_INBOX = ["3Xj6YZ8Q", "VeeapSCqb61YFR"].join("");
const read = (file: string) => readFileSync(file, "utf8");

describe("the owner inbox page source", () => {
  it("exists", () => {
    expect(existsSync(PAGE)).toBe(true);
  });

  it("holds no item: the items live in the page's store", () => {
    const page = read(PAGE);
    expect(page).not.toMatch(/\bkind\s*:\s*["'](step|decision)["']/);
    expect(page).not.toMatch(/["']kind["']\s*:/);
    expect(page).not.toMatch(/\bitems\s*=\s*\[\s*[{"'`]/);
    expect(page).not.toMatch(/\bbatch-\d|-[a-z0-9]{3,4}\.\d/);
  });

  // Prettier lays the page's script out as it likes: compare without whitespace.
  it("keeps the store shape: items by order, hidden filtered, answers by item id", () => {
    const page = read(PAGE).replaceAll(/\s+/g, "");
    expect(page).toContain('collection("items").orderBy("order")');
    expect(page).toContain(".filter((i)=>!i.hidden)");
    expect(page).toContain('db.doc("answers/"+id).set(rec)');
    expect(page).toContain('rec={choice,note:note||"",updatedAt:');
    expect(page).toContain('claude.use("db")');
  });

  it("names no first project and holds no Hebrew", () => {
    const page = read(PAGE);
    expect(page).not.toMatch(/kalivent|picime|picme|iplan|mit4mit/i);
    expect(page).not.toMatch(/\p{Script=Hebrew}/u);
  });

  it("makes no external request: no URL, link, import or font service", () => {
    const page = read(PAGE);
    expect(page).not.toMatch(/https?:\/\//i);
    expect(page).not.toMatch(/(^|[^:])\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(page).not.toMatch(/<link\b|@import|<script[^>]+\bsrc=|url\(/i);
    expect(page).not.toMatch(/googleapis|gstatic|fonts\./i);
  });

  it("is titled Owner Inbox and keeps the light and dark theme structure", () => {
    const page = read(PAGE);
    expect(page).toMatch(/<title>Owner Inbox<\/title>/);
    expect(page).toContain("@media (prefers-color-scheme: dark)");
    expect(page).toContain(':root:not([data-theme="light"])');
    expect(page).toContain(':root[data-theme="dark"]');
  });
});

// The skill as the template ships it holds the placeholder; bootstrap step 3
// replaces it with the published page's URL. Both must pass: the checks run on
// the file as it is and on a copy filled the way step 3 fills it. What the
// skill lacks, as a list, so a test asserts it is empty.
function skillLacks(skill: string) {
  const needs: [string, RegExp | string][] = [
    ["its name", /^---\nname: owner-inbox\ndescription: Use when /],
    ["ArtifactData", "`ArtifactData`"],
    ["its capabilities", "`capabilities: { db: {}, user: {} }`"],
    ["the inbox URL or its placeholder", INBOX_URL_OR_PLACEHOLDER],
    ["hiding", "hidden: true"],
    ["order", "order"],
    ...["kind", "title", "bead", "question", "recommendation", "unblocks"].map(
      (field): [string, string] => [field, `\`${field}\``],
    ),
  ];
  return needs
    .filter(([, need]) => (typeof need === "string" ? !skill.includes(need) : !need.test(skill)))
    .map(([name]) => name);
}

describe("the owner-inbox skill", () => {
  it("is named, and covers publishing, adding, reading and hiding", () => {
    expect(skillLacks(read(SKILL))).toEqual([]);
  });

  it("still does once step 3 has put the page's URL in place of the placeholder", () => {
    const filled = read(SKILL).replaceAll(PLACEHOLDER, EXAMPLE_URL);
    expect(filled).not.toContain(PLACEHOLDER);
    expect(skillLacks(filled)).toEqual([]);
  });

  it("lacks the URL with neither the placeholder nor a URL", () => {
    const bare = read(SKILL)
      .replaceAll(PLACEHOLDER, "the page")
      .replaceAll(new RegExp(INBOX_URL.source, "g"), "the page");
    expect(skillLacks(bare)).toEqual(["the inbox URL or its placeholder"]);
  });
});

describe("the owner inbox URL", () => {
  const files = realRun("git", ["ls-files", "-co", "--exclude-standard"], { cwd: REPO })
    .split("\n")
    .filter((f) => f !== "" && existsSync(path.join(REPO, f)));

  // The placeholder until bootstrap step 3 publishes the page; then the one
  // URL it returned, the same in all three.
  const HOLDERS = ["CLAUDE.md", ".claude/skills/owner-inbox/SKILL.md", ".beads/seed-memories.json"];
  // What each holder points at: the placeholder, the URL, or nothing.
  const inboxIn = (texts: Record<string, string>) =>
    Object.entries(texts).map(([file, text]) =>
      text.includes(PLACEHOLDER) ? PLACEHOLDER : (INBOX_URL.exec(text)?.[0] ?? `none in ${file}`),
    );
  const holders = () => Object.fromEntries(HOLDERS.map((f) => [f, read(path.join(REPO, f))]));

  it("is the placeholder, or one inbox URL, in the rule, the skill and the memory", () => {
    const found = inboxIn(holders());
    expect(found).toEqual(found.map(() => found[0]));
    expect(found[0]).toMatch(/^<owner-inbox-url>$|^https:/);
  });

  // The same check on the three files filled the way step 3 fills them, so a
  // filled project keeps it green, and a fill that missed one file fails it.
  it("is one URL in all three once step 3 has filled them, and fails on a missed one", () => {
    const filled = Object.fromEntries(
      Object.entries(holders()).map(([f, text]) => [f, text.replaceAll(PLACEHOLDER, EXAMPLE_URL)]),
    );
    const found = inboxIn(filled);
    expect(found).toEqual(found.map(() => found[0]));
    expect(found[0]).toMatch(INBOX_URL);
    const missed = { ...filled, "CLAUDE.md": `page (${PLACEHOLDER})` };
    expect(new Set(inboxIn(missed)).size).toBe(2);
  });

  it("leaves no first-project inbox URL anywhere", () => {
    const named = files.filter((f) => read(path.join(REPO, f)).includes(FIRST_PROJECT_INBOX));
    expect(named).toEqual([]);
  });

  // .claude/skills/bootstrap/fills.json lists each bootstrap token with the
  // files that carry it (TB87); tools/bootstrap/src/fills.test.ts checks every
  // token. This one is checked here too, beside the inbox's other tests: the
  // files are the rule, the skill and the memory until step 3 fills them, and
  // none after. Test files, the template-build log and the bootstrap's own
  // files talk about the token rather than carry it.
  it("is listed with every file that holds it in the bootstrap's fills", () => {
    const fills = JSON.parse(read(FILLS)) as Record<string, { files: string[] }>;
    const sorted = (list: string[]) => list.toSorted((a, b) => a.localeCompare(b));
    let holders: string[];
    try {
      holders = realRun("git", ["grep", "-l", "-F", PLACEHOLDER], { cwd: REPO })
        .split("\n")
        .filter(
          (f) =>
            f !== "" &&
            !f.endsWith(".test.ts") &&
            f !== "docs/decisions/2026-10-21-template-build-decisions.md" &&
            !f.startsWith(".claude/skills/bootstrap/"),
        );
    } catch {
      holders = []; // git grep exits 1 once step 3 has filled it everywhere
    }
    const listed = sorted(fills[PLACEHOLDER]?.files ?? []);
    expect(listed).toEqual(sorted(HOLDERS));
    expect([[], listed]).toContainEqual(sorted(holders));
  });
});
