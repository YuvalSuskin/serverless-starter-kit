import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import type { Finding } from "./schema.ts";

import { plant, plantSnapshot, score, type Seed, SEEDS } from "./recall.ts";
import { sampleFinding, tempRepo, writeFiles } from "./testing.ts";

const seed: Seed = {
  id: "region",
  file: "infra/CLAUDE.md",
  find: "go in `eu-west-1` only",
  replace: "go in `eu-central-1` only",
  kind: "conflict",
  refs: ["infra/CLAUDE.md", "CLAUDE.md"],
};

it("plants seeds in a committed copy and leaves the repo untouched", () => {
  const root = tempRepo({
    "infra/CLAUDE.md": "Resources go in `eu-west-1` only.\n",
    "CLAUDE.md": "x\n",
  });
  const out = plant(root, [seed], mkdtempSync(path.join(tmpdir(), "plant-")));
  expect(readFileSync(path.join(out, "infra/CLAUDE.md"), "utf8")).toContain("`eu-central-1`");
  expect(readFileSync(path.join(root, "infra/CLAUDE.md"), "utf8")).toContain("`eu-west-1`");
  expect(existsSync(path.join(out, ".git"))).toBe(true);
});

it("refuses a seed whose text is no longer in the repo, naming it", () => {
  const root = tempRepo({ "infra/CLAUDE.md": "Something else.\n" });
  expect(() => plant(root, [seed], mkdtempSync(path.join(tmpdir(), "plant-")))).toThrow(
    /seed region: its text is no longer in infra\/CLAUDE\.md/,
  );
});

it("plants memory seeds in a run's snapshot, not in bd", () => {
  const runDir = mkdtempSync(path.join(tmpdir(), "run-"));
  writeFiles(runDir, {
    "snapshot/memories/rule.md": "# memory:rule\n\nDo not ask many questions.\n",
  });
  plantSnapshot(runDir, [
    {
      id: "memory",
      file: "snapshot/memories/rule.md",
      find: "Do not ask many questions.",
      replace: "Ask every question.",
      kind: "conflict",
      refs: ["memory:rule"],
    },
  ]);
  expect(readFileSync(path.join(runDir, "snapshot/memories/rule.md"), "utf8")).toContain(
    "Ask every question.",
  );
});

it("counts a seed found when a finding of an accepted kind cites all its refs", () => {
  const cites = (refs: string[], kind: Finding["kind"] = "conflict") =>
    sampleFinding({
      kind,
      // Each side quotes the planted text, as a finding about the seed would.
      sides: refs.map((ref) => ({
        type: "claude-md" as const,
        ref,
        quote: "go in `eu-central-1` only",
      })),
    });
  const other: Seed = {
    ...seed,
    id: "other",
    file: "a.md",
    refs: ["a.md"],
    kind: "code-drift",
    accepts: ["code-drift", "conflict"],
  };
  expect(
    score([seed, other], [cites(["infra/CLAUDE.md", "CLAUDE.md"]), cites(["a.md"], "conflict")]),
  ).toEqual({
    found: ["region", "other"],
    missed: [],
    recall: 1,
  });
  expect(score([seed], [cites(["infra/CLAUDE.md"])])).toEqual({
    found: [],
    missed: ["region"],
    recall: 0,
  });
  expect(score([seed], [cites(["infra/CLAUDE.md", "CLAUDE.md"], "duplicate")]).missed).toEqual([
    "region",
  ]);
});

it("ships about ten seeds, each with a unique id and at least one ref", () => {
  expect(SEEDS.length).toBeGreaterThanOrEqual(10);
  expect(new Set(SEEDS.map((s) => s.id)).size).toBe(SEEDS.length);
  expect(SEEDS.every((s) => s.refs.length > 0 && s.find !== s.replace)).toBe(true);
});

it("counts a seed only when a finding quotes the planted passage, not just its files", () => {
  const wrongPassage = sampleFinding({
    sides: [
      {
        type: "claude-md",
        ref: "infra/CLAUDE.md",
        quote: "Accounts are managed in Identity Center.",
      },
      { type: "claude-md", ref: "CLAUDE.md", quote: "Data stays in Israel." },
    ],
  });
  expect(score([seed], [wrongPassage]).missed).toEqual(["region"]);
  const planted = sampleFinding({
    sides: [
      {
        type: "claude-md",
        ref: "infra/CLAUDE.md",
        quote: "Regional AWS resources go in `eu-central-1` only",
      },
      { type: "claude-md", ref: "CLAUDE.md", quote: "eu-west-1" },
    ],
  });
  expect(score([seed], [planted]).found).toEqual(["region"]);
});

it("maps a snapshot seed's file to the memory or bead a finding cites", () => {
  const memorySeed: Seed = {
    id: "memory",
    file: "snapshot/memories/fewer-questions.md",
    find: "do not ask many questions.",
    replace: "ask the owner every open question in conversation",
    kind: "conflict",
    refs: ["memory:fewer-questions", "CLAUDE.md"],
  };
  const finding = sampleFinding({
    sides: [
      {
        type: "memory",
        ref: "memory:fewer-questions",
        quote: "ask the owner every open question in conversation",
      },
      {
        type: "claude-md",
        ref: "CLAUDE.md",
        quote: "Never hold work waiting on a conversational question",
      },
    ],
  });
  expect(score([memorySeed], [finding]).found).toEqual(["memory"]);
});

// A seed whose text is gone from the repo is rewritten against today's text
// (tools/sweep/CLAUDE.md); this catches it when a doc changes, not when a run
// tries to plant it. Bead and memory seeds live in a run's snapshot, not here.
it("ships seeds whose text is in the repo today", () => {
  const repo = path.join(import.meta.dirname, "../../..");
  const missing = SEEDS.filter((s) => !s.file.startsWith("snapshot/")).filter(
    (s) =>
      !existsSync(path.join(repo, s.file)) ||
      !readFileSync(path.join(repo, s.file), "utf8").includes(s.find),
  );
  expect(missing.map((s) => s.id)).toEqual([]);
});
