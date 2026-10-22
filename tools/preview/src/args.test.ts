import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

import { parseCli, USAGE } from "./args.ts";

it.each([
  [["acme-abc"], { kind: "up", open: true, target: "acme-abc" }],
  [["--", "#12", "--no-open"], { kind: "up", open: false, target: "#12" }],
  [["list"], { kind: "list" }],
  [["doctor"], { kind: "doctor" }],
  [["stop", "shop"], { all: false, kind: "stop", remove: false, target: "shop" }],
  [["stop", "--all"], { all: true, kind: "stop", remove: false, target: undefined }],
  [["stop", "shop", "--remove"], { all: false, kind: "stop", remove: true, target: "shop" }],
  [[], { kind: "help" }],
  [["stop"], { kind: "help", message: "stop needs a target, or --all" }],
])("%j", (argv, command) => {
  expect(parseCli(argv)).toEqual(command);
});

it("turns an unknown flag into help with the reason", () => {
  const command = parseCli(["up", "--bogus"]);
  expect(command.kind).toBe("help");
  expect(command.kind === "help" && command.message).toMatch(/bogus/);
});

// An unquoted #12 is a shell comment: `pnpm preview #12` reaches preview as no
// arguments at all. Everything that teaches the PR form must quote it.
it("teaches the PR form quoted, in the usage text and the /preview skill", () => {
  const skill = readFileSync(
    path.join(import.meta.dirname, "../../../.claude/skills/preview/SKILL.md"),
    "utf8",
  );
  for (const text of [USAGE, skill]) {
    expect(text).toContain("'#12'");
    expect(text).not.toMatch(/pnpm preview #/);
  }
});
