import { describe, expect, it } from "vitest";

import { claimedBeads, createdPr, record } from "./bead-branch.ts";

describe("claimedBeads", () => {
  it.each([
    ["bd update acme-abc --claim", ["acme-abc"]],
    ["bd update acme-abc acme-def --claim", ["acme-abc", "acme-def"]],
    ["bd update acme-abc --status in_progress", ["acme-abc"]],
    ["bd update acme-abc --status=in_progress", ["acme-abc"]],
    ["cd x && bd update acme-abc --claim --json", ["acme-abc"]],
    ["bd update acme-abc --notes 'wip'", []],
    ["bd close acme-abc", []],
    ["echo bd update", []],
  ])("%s", (command, ids) => {
    expect(claimedBeads(command)).toEqual(ids);
  });
});

describe("createdPr", () => {
  it("reads the PR number gh prints", () => {
    expect(createdPr("gh pr create --fill", "https://github.com/o/r/pull/42\n")).toBe(42);
    expect(createdPr("gh pr view 42", "https://github.com/o/r/pull/42\n")).toBeUndefined();
  });
});

describe("record", () => {
  const exec = (answers: Record<string, string>) => {
    const calls: string[] = [];
    const fn = (command: string, args: string[]) => {
      const key = [command, ...args].join(" ");
      calls.push(key);
      return answers[key] ?? "";
    };
    return { calls, fn };
  };

  it("records the session's branch on a claimed bead", () => {
    const { calls, fn } = exec({ "git branch --show-current": "claude/a-111111\n" });
    const actions = record(
      { cwd: "/w", tool_input: { command: "bd update acme-abc --claim" }, tool_name: "Bash" },
      fn,
    );
    expect(actions).toEqual(["acme-abc branch=claude/a-111111"]);
    expect(calls).toContain("bd update acme-abc --set-metadata branch=claude/a-111111");
  });

  it("does not record main", () => {
    const { calls, fn } = exec({ "git branch --show-current": "main\n" });
    record(
      { cwd: "/w", tool_input: { command: "bd update acme-abc --claim" }, tool_name: "Bash" },
      fn,
    );
    expect(calls.some((call) => call.includes("--set-metadata"))).toBe(false);
  });

  it("links a new PR to the bead whose branch it is", () => {
    const { calls, fn } = exec({
      "bd list --metadata-field branch=claude/a-111111 --all --json": '[{"id":"acme-abc"}]',
      "git branch --show-current": "claude/a-111111\n",
    });
    const actions = record(
      {
        cwd: "/w",
        tool_input: { command: "gh pr create --fill" },
        tool_name: "Bash",
        tool_response: { stdout: "https://github.com/o/r/pull/42\n" },
      },
      fn,
    );
    expect(actions).toEqual(["acme-abc external-ref=gh-42"]);
    expect(calls).toContain("bd update acme-abc --external-ref gh-42");
  });

  it("ignores other tools and malformed input", () => {
    const { calls, fn } = exec({});
    expect(record({ tool_name: "Edit" }, fn)).toEqual([]);
    expect(record({ tool_name: "Bash" }, fn)).toEqual([]);
    expect(calls).toEqual([]);
  });
});
