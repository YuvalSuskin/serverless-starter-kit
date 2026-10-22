import { expect, it } from "vitest";

import { lint } from "./lint.ts";
import { tempRepo } from "./testing.ts";

const header = (beads: string) => `# A design\n\n**Status:** approved\n${beads}\n\n## 1. Why\n`;

it("passes a repo whose specs, plans and research name their beads", () => {
  const root = tempRepo({
    "docs/superpowers/specs/s.md": header("**Beads:** `acme-ls4`"),
    "docs/superpowers/plans/p.md": header("**Bead:** acme-ls4.1"),
    "docs/research/r.md": header("**For:** the guides (bead acme-h18)."),
    "docs/superpowers/plans/q.md":
      "# Plan\n\n> **For agentic workers:** Each task is also a bead under `acme-5ss.1`.\n",
  });
  expect(lint(root, { unlinked: [] })).toEqual([]);
});

it("fails a live spec, plan or research file that names no bead", () => {
  const root = tempRepo({
    "docs/superpowers/specs/s.md": header(""),
    "docs/research/r.md": header(""),
  });
  expect(lint(root, { unlinked: [] })).toEqual([
    "docs/research/r.md: names no bead in its header (add a **Beads:** line)",
    "docs/superpowers/specs/s.md: names no bead in its header (add a **Beads:** line)",
  ]);
});

it("counts the beads of the repo's own prefix, not another project's", () => {
  const files = (id: string) => ({
    ".beads/config.yaml": 'issue-prefix: "shop"\n',
    "docs/superpowers/specs/s.md": header(`**Beads:** ${id}`),
  });
  expect(lint(tempRepo(files("shop-ls4")), { unlinked: [] })).toEqual([]);
  expect(lint(tempRepo(files("acme-ls4")), { unlinked: [] })).toHaveLength(1);
});

it("counts the beads of a hyphenated prefix", () => {
  const root = tempRepo({
    ".beads/config.yaml": 'issue-prefix: "my-shop"\n',
    "docs/superpowers/specs/s.md": header("**Beads:** my-shop-ls4"),
  });
  expect(lint(root, { unlinked: [] })).toEqual([]);
});

it("only reads the header: a bead named further down does not count", () => {
  const late = `${header("")}${"\ntext".repeat(20)}\nacme-ls4\n`;
  const root = tempRepo({ "docs/superpowers/specs/s.md": late });
  expect(lint(root, { unlinked: [] })).toHaveLength(1);
});

it("skips listed exceptions, CLAUDE.md files, product specs and the archive", () => {
  const root = tempRepo({
    "docs/superpowers/specs/old.md": header(""),
    "docs/superpowers/specs/CLAUDE.md": "# Rules\n",
    "docs/product/sign-in.md": "# Sign in\n",
    "docs/archive/superpowers/plans/p.md": header(""),
  });
  expect(lint(root, { unlinked: ["docs/superpowers/specs/old.md"] })).toEqual([]);
});

it("fails a listed exception that no longer exists, so the list only shrinks", () => {
  const root = tempRepo({ "README.md": "x" });
  expect(lint(root, { unlinked: ["docs/superpowers/specs/gone.md"] })).toEqual([
    "tools/sweep/src/unlinked.json: lists docs/superpowers/specs/gone.md, which is gone or names its beads now; remove it",
  ]);
});

it("fails a broken link", () => {
  const root = tempRepo({ "docs/decisions/d.md": "[x](missing.md)" });
  expect(lint(root, { unlinked: [] })).toEqual(["docs/decisions/d.md: broken link missing.md"]);
});

it("fails graphify in a CLAUDE.md, a settings file or a hook config", () => {
  const root = tempRepo({
    "frontend/CLAUDE.md": "Run graphify query first.",
    "docs/product/CLAUDE.md": "Use Graphify.",
    ".claude/settings.json": '{ "hooks": { "PreToolUse": [{ "command": "graphify hook" }] } }',
    ".husky/pre-commit": "graphify update",
  });
  expect(lint(root, { unlinked: [] })).toEqual([
    ".claude/settings.json: mentions graphify, which serves only the sweep (spec §13)",
    ".husky/pre-commit: mentions graphify, which serves only the sweep (spec §13)",
    "docs/product/CLAUDE.md: mentions graphify, which serves only the sweep (spec §13)",
    "frontend/CLAUDE.md: mentions graphify, which serves only the sweep (spec §13)",
  ]);
});

it("fails graphify in the beads git hooks and the MCP server list", () => {
  const root = tempRepo({
    ".beads/hooks/post-commit": "graphify update .",
    ".mcp.json": '{ "mcpServers": { "graph": { "command": "graphify" } } }',
  });
  expect(lint(root, { unlinked: [] })).toEqual([
    ".beads/hooks/post-commit: mentions graphify, which serves only the sweep (spec §13)",
    ".mcp.json: mentions graphify, which serves only the sweep (spec §13)",
  ]);
});

it("allows graphify in the sweep's own files and in ordinary docs", () => {
  const root = tempRepo({
    "tools/sweep/CLAUDE.md": "Graphify is called only by src/graph.ts.",
    ".claude/skills/sweep/SKILL.md": "pnpm sweep graph runs graphify.",
    "docs/superpowers/specs/s.md": `${header("**Beads:** acme-ls4")}Graphify routes.`,
  });
  expect(lint(root, { unlinked: [] })).toEqual([]);
});

it("reads the exceptions list from the repo it checks", () => {
  const root = tempRepo({
    "docs/research/r.md": "# R\n",
    "tools/sweep/src/unlinked.json": JSON.stringify(["docs/research/r.md"]),
  });
  expect(lint(root)).toEqual([]);
});
