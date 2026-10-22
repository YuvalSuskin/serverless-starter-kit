// The tracker check `pnpm rename` makes before it changes anything: an empty
// database (the one Claude Code's SessionStart hook leaves, `bd prime`
// creating it) is set aside; one holding anything stops the rename.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";

import type { RunResult } from "./finish.ts";

import { existingTracker, setAsideTracker } from "./tracker.ts";

function repo(dirs: string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), "tracker-test-"));
  onTestFinished(() => {
    rmSync(root, { force: true, recursive: true });
  });
  mkdirSync(path.join(root, ".beads"));
  writeFileSync(path.join(root, ".beads/config.yaml"), "# the prefix\nissue-prefix: tpl\n");
  for (const dir of dirs) {
    mkdirSync(path.join(root, ".beads", dir, "tpl"), { recursive: true });
    writeFileSync(path.join(root, ".beads", dir, "tpl", "data"), "x");
  }
  return root;
}

/** Answers bd's three questions; `fail` makes the call starting with it fail. */
function bd(answers: { count?: number; fail?: string; memories?: object; prefix?: string }) {
  const calls: string[] = [];
  const run = (cmd: string, args: string[]): RunResult => {
    const joined = [cmd, ...args].join(" ");
    calls.push(joined);
    const ok = (value: object) => ({ status: 0, stderr: "", stdout: JSON.stringify(value) });
    if (answers.fail !== undefined && joined.startsWith(answers.fail)) {
      return { status: 1, stderr: "database is locked\n", stdout: "" };
    }
    if (args[0] === "count") return ok({ count: answers.count ?? 0, schema_version: 1 });
    if (args[0] === "memories") return ok({ schema_version: 1, ...answers.memories });
    if (args[0] === "config") {
      return ok({ key: "issue_prefix", schema_version: 1, value: answers.prefix ?? "" });
    }
    throw new Error(`unexpected call: ${joined}`);
  };
  return { calls, run };
}

describe("existingTracker", () => {
  it("is none when .beads holds no database, and asks bd nothing", () => {
    const { calls, run } = bd({});
    expect(existingTracker(repo([]), run)).toEqual({ kind: "none" });
    expect(calls).toEqual([]);
  });

  it("is empty for the database bd prime leaves: no issue, no memory, no prefix", () => {
    const { calls, run } = bd({});
    expect(existingTracker(repo(["embeddeddolt"]), run)).toEqual({
      dirs: ["embeddeddolt"],
      kind: "empty",
    });
    expect(calls).toEqual([
      "bd count --include-infra --json",
      "bd memories --json",
      "bd config get issue_prefix --json",
    ]);
  });

  it("is empty when the only prefix is the template's own (config.yaml's)", () => {
    expect(existingTracker(repo(["dolt"]), bd({ prefix: "tpl" }).run)).toEqual({
      dirs: ["dolt"],
      kind: "empty",
    });
  });

  it.each([
    ["an issue, open or closed", { count: 1 }, "1 issue"],
    ["a memory", { memories: { "some-key": "a note" } }, "1 memory"],
    ["a prefix of its own", { prefix: "mine" }, 'the prefix "mine"'],
    ["a bd error", { fail: "bd memories" }, "bd memories --json failed"],
  ])("is used when it holds %s", (_what, answers, why) => {
    const state = existingTracker(repo(["embeddeddolt"]), bd(answers).run);
    expect(state.kind).toBe("used");
    expect(state.kind === "used" ? state.why : "").toContain(why);
  });
});

describe("setAsideTracker", () => {
  it("moves each database under .beads/set-aside-<stamp>/, where bd does not look", () => {
    const root = repo(["embeddeddolt", "dolt"]);
    const moved = setAsideTracker(root, ["embeddeddolt", "dolt"], new Date("2026-10-22T09:30:00Z"));
    expect(moved).toEqual([
      ".beads/set-aside-20261022T093000Z/embeddeddolt",
      ".beads/set-aside-20261022T093000Z/dolt",
    ]);
    expect(existsSync(path.join(root, ".beads/embeddeddolt"))).toBe(false);
    expect(existsSync(path.join(root, ".beads/dolt"))).toBe(false);
    expect(readdirSync(path.join(root, moved[0] ?? "", "tpl"))).toEqual(["data"]);
  });
});
