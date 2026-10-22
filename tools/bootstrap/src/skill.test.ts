// The `/bootstrap` skill's files: one per step, the skill naming each, the
// skeleton list of step 6 matching the files that carry the marker, and a
// trial brief with no real account in it. Reads the real repo.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseState, STEPS } from "./bootstrap-state.ts";

const REPO = path.join(import.meta.dirname, "../../..");
const SKILL = ".claude/skills/bootstrap";
const read = (file: string) => readFileSync(path.join(REPO, file), "utf8");
// Split, so this file does not carry the marker it looks for.
const MARKER = ["Skeleton", ":"].join("");
const TEMPLATE_LOG = "docs/decisions/2026-10-21-template-build-decisions.md";
const STATE_FILE = path.join(REPO, ".bootstrap/state.json");
const state = parseState(
  existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, "utf8")) as unknown) : undefined,
);

describe("the bootstrap skill", () => {
  it("is named, and says how it resumes and how it asks", () => {
    const skill = read(`${SKILL}/SKILL.md`);
    expect(skill).toMatch(/^---\nname: bootstrap\ndescription: Use when /);
    expect(skill).toContain(".bootstrap/state.json");
    expect(skill).toContain("pnpm bootstrap:state");
    expect(skill).toMatch(/one question (at a time|per message)/i);
  });

  it.each(STEPS)("has a file for %s, named in the skill", (step) => {
    expect(existsSync(path.join(REPO, SKILL, "steps", `${step}.md`))).toBe(true);
    expect(read(`${SKILL}/SKILL.md`)).toContain(`steps/${step}.md`);
  });

  it.each(STEPS)("says what %s asks, writes, records, and when it is done", (step) => {
    const text = read(`${SKILL}/steps/${step}.md`);
    const missing = ["## Asks", "## Writes", "## Records", "## Done when"].filter(
      (heading) => !text.includes(heading),
    );
    expect(missing).toEqual([]);
  });
});

describe("step 6's skeleton list", () => {
  const STEP_6 = `${SKILL}/steps/6-replace-skeleton.md`;
  const rows = [...read(STEP_6).matchAll(/^\| `([^`]+)` +\| (\w+) +\|/gm)].map(
    ([, file = "", action = ""]) => ({ action, file }),
  );

  // Until step 6 is done, the list is exactly the files that carry the
  // marker; once it is done, no file carries it (each was deleted, edited, or
  // kept without the marker).
  it("is every file that carries the skeleton marker, each once, until step 6 removes it", () => {
    let marked: string[];
    try {
      marked = execFileSync("git", ["grep", "-l", "-F", MARKER], { cwd: REPO, encoding: "utf8" })
        .split("\n")
        .filter((file) => file !== "" && !file.startsWith(`${SKILL}/`) && file !== TEMPLATE_LOG);
    } catch {
      marked = []; // git grep exits 1 when nothing matches
    }
    const listed = rows.map((row) => row.file);
    expect(listed.length).toBeGreaterThan(30);
    expect(new Set(listed).size).toBe(listed.length);
    const expected = state.steps["6-replace-skeleton"]?.status === "done" ? [] : listed;
    expect(marked.toSorted((a, b) => a.localeCompare(b))).toEqual(
      expected.toSorted((a, b) => a.localeCompare(b)),
    );
  });

  // Only step 6 removes the marker. A step before it that edits a marked file
  // says to keep it (the first trial's step 4 reworded fonts.ts's comment and
  // failed the list above), and the skill states the rule once.
  it("is kept by every other step that names a marked file", () => {
    expect(read(`${SKILL}/SKILL.md`)).toContain("## The skeleton marker");
    const marked = new Set(rows.map((row) => row.file));
    const silent = STEPS.filter((step) => step !== "6-replace-skeleton").filter((step) => {
      const text = read(`${SKILL}/steps/${step}.md`);
      const names = [...text.matchAll(/`([^`\s]+)`/g)].some(([, file = ""]) => marked.has(file));
      return names && !text.includes(`\`${MARKER}\``);
    });
    expect(silent).toEqual([]);
  });

  // A file that names a demo file step 6 deletes breaks when it goes: it is
  // in the list, or step 6 would meet a rule test it is told never to change
  // (structure.test.ts's demo store, lint-rules.test.ts's demo use case).
  it.skipIf(state.steps["6-replace-skeleton"]?.status === "done")(
    "holds every file that names a demo file it deletes",
    () => {
      const listed = new Set(rows.map((row) => row.file));
      // The distinctive names: a deleted file's hyphenated name, unless the row keeps it conditionally.
      const conditional = new Set(
        read(STEP_6)
          .split("\n")
          .filter((line) => line.startsWith("| `"))
          .map((line) => line.split("|").map((cell) => cell.trim()))
          .filter((cells) => cells[2] === "delete" && (cells[3] ?? "").startsWith("unless"))
          .map((cells) => (cells[1] ?? "").replaceAll("`", "")),
      );
      const stems = [
        ...new Set(
          rows
            .filter((row) => row.action === "delete" && !conditional.has(row.file))
            .map((row) => path.basename(row.file).split(".")[0] ?? "")
            .filter((stem) => stem.includes("-")),
        ),
      ];
      expect(stems).toEqual(
        expect.arrayContaining(["message-store", "list-messages", "contact-form"]),
      );
      const naming = stems.flatMap((stem) => {
        let found: string[];
        try {
          found = execFileSync("git", ["grep", "-l", "-F", stem], { cwd: REPO, encoding: "utf8" })
            .split("\n")
            .filter((file) => file !== "");
        } catch {
          found = [];
        }
        return found
          .filter(
            (file) =>
              !listed.has(file) &&
              !file.startsWith(`${SKILL}/`) &&
              !file.startsWith("docs/decisions/") &&
              file !== "pnpm-lock.yaml" &&
              file !== "tools/bootstrap/src/skill.test.ts",
          )
          .map((file) => `${file} names ${stem}`);
      });
      expect(naming).toEqual([]);
    },
  );

  it("says for each file whether it is deleted, edited or kept", () => {
    const unknown = rows.filter((row) => !["delete", "edit", "keep"].includes(row.action));
    expect(unknown).toEqual([]);
  });
});

describe("the trial brief", () => {
  const brief = read(`${SKILL}/trial-brief.md`);

  it.each(STEPS)("answers %s", (step) => {
    expect(brief).toContain(`## ${step}`);
  });

  it("holds no real account: no AWS account id, no real address or URL", () => {
    expect(brief).not.toMatch(/\b\d{12}\b/);
    expect(brief).not.toMatch(/https?:\/\/(?!claude\.ai\/)/);
    const addresses = brief
      .split(/[\s`(),;:]+/)
      .filter((word) => /^[\w.+-]+@[\w-]/.test(word))
      .map((word) => word.replace(/\.$/, ""));
    expect(addresses.length).toBeGreaterThan(0);
    expect(addresses.filter((address) => !/\.(test|example|invalid)$/.test(address))).toEqual([]);
  });
});
