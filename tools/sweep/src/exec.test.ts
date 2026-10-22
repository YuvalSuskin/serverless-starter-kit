import { expect, it } from "vitest";

import { realRun } from "./exec.ts";

it("returns a command's output", () => {
  expect(realRun("git", ["--version"])).toMatch(/^git version/);
});

it("throws naming the command and its error when it fails", () => {
  expect(() => realRun("git", ["no-such-command"])).toThrow(/^git no-such-command failed: .+/);
});
