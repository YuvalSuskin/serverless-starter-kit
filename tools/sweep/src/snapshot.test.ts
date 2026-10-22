import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import type { Run } from "./exec.ts";

import { snapshot } from "./snapshot.ts";
import { tempRepo } from "./testing.ts";

const FIXTURES = path.join(import.meta.dirname, "fixtures/bd");
const fixture = (name: string) => readFileSync(path.join(FIXTURES, name), "utf8");

/** bd, answered from the recorded fixtures (bd export, trimmed to four beads). */
const fakeBd: Run = (cmd, args) => {
  const call = args.join(" ");
  if (cmd !== "bd") throw new Error(`unexpected ${cmd}`);
  if (call === "export") return fixture("export.jsonl");
  if (call === "memories --json") {
    // bd puts a numeric schema_version beside the memories.
    return JSON.stringify({ ...JSON.parse(fixture("memories.json")), schema_version: 1 });
  }
  throw new Error(`unexpected bd ${call}`);
};

// The repo the beads point into: only files that exist become links.
const repoWith = () =>
  tempRepo({
    "docs/product/marketing-home.md":
      "# Home\n\n**HOME-R23.** The questions.\n\n**HOME-R25.** Open until.\n",
    "docs/decisions/2026-09-25-backend-decisions.md":
      "| # | Decision |\n| --- | --- |\n| O4 | Something |\n",
    "docs/competitors/x/profile.md": "# X",
    "frontend/src/app/(marketing)/_content/questions.ts": "export {};",
  });

/** bd holding one open bead with this description. */
function oneBead(description: string): Run {
  return (_cmd, args) =>
    args[0] === "export"
      ? `${JSON.stringify({ id: "acme-x1", title: "T", status: "open", description })}\n`
      : "{}";
}

function run() {
  const root = repoWith();
  const out = mkdtempSync(path.join(tmpdir(), "snap-"));
  const counts = snapshot(root, out, fakeBd);
  const read = (file: string) => readFileSync(path.join(out, "snapshot", file), "utf8");
  return { root, out, counts, read };
}

it("writes every open bead, every closed decision bead and every memory, and no other closed bead", () => {
  const { counts, out } = run();
  expect(counts).toEqual({ beads: 3, memories: 2 });
  expect(readdirSync(path.join(out, "snapshot/beads")).sort((a, b) => a.localeCompare(b))).toEqual([
    "acme-al7.md",
    "acme-kme.10.md",
    "acme-ls4.3.md",
  ]);
  expect(
    readdirSync(path.join(out, "snapshot/memories")).sort((a, b) => a.localeCompare(b)),
  ).toEqual(["fewer-questions.md", "pay-per-use.md"]);
});

it("gives a bead a header and one section per field it has", () => {
  const { read } = run();
  const bead = read("beads/acme-kme.10.md");
  expect(bead).toMatch(/^# acme-kme\.10: /);
  expect(bead).toContain("- status: closed");
  expect(bead).toContain("- labels: batch-1, decision, marketing, product, review, stage-1");
  expect(bead).toContain("\n## Description (field: description)\n");
  expect(bead).toContain("\n## Comments (field: comments)\n");
});

it("writes a complete file for a bead with no design, comments or dependencies", () => {
  const { read } = run();
  const bead = read("beads/acme-al7.md");
  expect(bead).toContain("\n## Description (field: description)\n");
  expect(bead).not.toContain("## Design");
  expect(bead).not.toContain("## Comments");
  expect(bead).not.toContain("- parent:");
});

it("links parents and dependencies as wikilinks", () => {
  const { read } = run();
  const bead = read("beads/acme-ls4.3.md");
  expect(bead).toContain("- depends on: acme-ls4.2 (blocks)");
});

it("turns repo paths a bead names into links that work from the stage root, and leaves missing ones", () => {
  const { read } = run();
  const bead = read("beads/acme-kme.10.md");
  expect(bead).toContain("[docs/product/marketing-home.md](../../docs/product/marketing-home.md)");
  // Parentheses in a target: angle brackets, so no parser cuts it at ")".
  expect(bead).toContain(
    "[frontend/src/app/(marketing)/_content/questions.ts](<../../frontend/src/app/(marketing)/_content/questions.ts>)",
  );
  const memory = read("memories/pay-per-use.md");
  expect(memory).toContain("root CLAUDE.md");
  expect(memory).not.toContain("](../../");
});

it("links each decision and product ID a text mentions to the file that defines it, once", () => {
  const { read } = run();
  const mentions =
    read("beads/acme-kme.10.md")
      .split("\n")
      .find((line) => line.startsWith("Mentions: ")) ?? "";
  const words = mentions.split(" ");
  expect(words).toContain("[O4](../../docs/decisions/2026-09-25-backend-decisions.md)");
  expect(words).toContain("[HOME-R23](../../docs/product/marketing-home.md)");
  expect(words.filter((word) => word.startsWith("[HOME-R25]"))).toHaveLength(1);
  // Defined nowhere in this repo: not a mention.
  expect(mentions).not.toContain("O17");
});

it("wikilinks only the beads the snapshot holds", () => {
  const { read } = run();
  const mentions =
    read("beads/acme-kme.10.md")
      .split("\n")
      .find((line) => line.startsWith("Mentions: ")) ?? "";
  expect(mentions).not.toContain("[[acme-n29.3]]");
  const bead = read("beads/acme-ls4.3.md");
  expect(bead).toContain("- parent: acme-ls4");
  expect(bead).not.toContain("[[acme-ls4]]");
});

it("names each section's bead field, so findings cite one spelling", () => {
  const { read } = run();
  const bead = read("beads/acme-kme.10.md");
  expect(bead).toContain("\n## Description (field: description)\n");
  expect(bead).toContain("\n## Comments (field: comments)\n");
});

it("links only to files the sweep reads, and writes the others as plain text", () => {
  const root = repoWith();
  const out = mkdtempSync(path.join(tmpdir(), "snap-"));
  const text = "See docs/competitors/x/profile.md and docs/product/marketing-home.md.";
  snapshot(root, out, oneBead(text));
  const bead = readFileSync(path.join(out, "snapshot/beads/acme-x1.md"), "utf8");
  expect(bead).toContain("See docs/competitors/x/profile.md and [docs/product");
});

it("skips export records that are not issues, and reads IDs in titles", () => {
  const root = repoWith();
  const out = mkdtempSync(path.join(tmpdir(), "snap-"));
  const lines = [
    { _type: "memory", key: "x", value: "y" },
    { _type: "issue", id: "acme-x1", title: "Decide O4", status: "open" },
  ];
  const bd: Run = (_cmd, args) =>
    args[0] === "export" ? lines.map((line) => JSON.stringify(line)).join("\n") : "{}";
  expect(snapshot(root, out, bd).beads).toBe(1);
  const bead = readFileSync(path.join(out, "snapshot/beads/acme-x1.md"), "utf8");
  expect(bead).toContain("Mentions: [O4](");
});

it("maps every snapshot file to the ref findings cite", () => {
  const { out } = run();
  const index = JSON.parse(readFileSync(path.join(out, "snapshot/index.json"), "utf8")) as Record<
    string,
    string
  >;
  expect(index["snapshot/beads/acme-al7.md"]).toBe("bead:acme-al7");
  expect(index["snapshot/memories/pay-per-use.md"]).toBe("memory:pay-per-use");
  expect(Object.keys(index)).toHaveLength(5);
});

it("fails with one error naming the command, and leaves no partial snapshot", () => {
  const root = repoWith();
  const out = mkdtempSync(path.join(tmpdir(), "snap-"));
  const broken: Run = (cmd, args) => {
    if (args[0] === "memories") throw new Error("bd memories --json failed: not signed in");
    return fakeBd(cmd, args);
  };
  expect(() => snapshot(root, out, broken)).toThrow(/bd memories --json failed/);
  expect(existsSync(path.join(out, "snapshot"))).toBe(false);
  expect(readdirSync(out)).toEqual([]);
});

it("links a path at the end of a sentence or inside parentheses without the punctuation", () => {
  const root = tempRepo({ "docs/product/marketing-home.md": "# Home" });
  const out = mkdtempSync(path.join(tmpdir(), "snap-"));
  const text =
    "See docs/product/marketing-home.md. Also (docs/product/marketing-home.md) and `docs/product/marketing-home.md`.";
  snapshot(root, out, oneBead(text));
  const bead = readFileSync(path.join(out, "snapshot/beads/acme-x1.md"), "utf8");
  const link = "(../../docs/product/marketing-home.md)";
  expect(bead).toContain(`See [docs/product/marketing-home.md]${link}. Also`);
  expect(bead).toContain(`Also ([docs/product/marketing-home.md]${link}) and`);
  expect(bead).toContain(`and [\`docs/product/marketing-home.md\`]${link}.`);
});

it("replaces an earlier snapshot whole: a bead gone from bd is gone from the snapshot", () => {
  const { root, out } = run();
  const fewer: Run = (cmd, args) =>
    args[0] === "export"
      ? fakeBd(cmd, args)
          .split("\n")
          .filter((line) => !line.includes('acme-al7", "title"'))
          .join("\n")
      : fakeBd(cmd, args);
  snapshot(root, out, fewer);
  expect(readdirSync(path.join(out, "snapshot/beads"))).toHaveLength(2);
  expect(existsSync(path.join(out, "snapshot/beads/acme-al7.md"))).toBe(false);
});

it("leaves the sweep's own beads out of the snapshot: they are records, not sources", () => {
  const root = repoWith();
  const out = mkdtempSync(path.join(tmpdir(), "snap-"));
  const lines = [
    {
      _type: "issue",
      id: "acme-s1",
      title: "Sweep: limits",
      status: "open",
      labels: ["sweep", "review"],
    },
    { _type: "issue", id: "acme-a1", title: "Spec", status: "open", labels: ["review"] },
  ];
  const bd: Run = (_cmd, args) =>
    args[0] === "export" ? lines.map((line) => JSON.stringify(line)).join("\n") : "{}";
  expect(snapshot(root, out, bd).beads).toBe(1);
  expect(existsSync(path.join(out, "snapshot/beads/acme-a1.md"))).toBe(true);
});
