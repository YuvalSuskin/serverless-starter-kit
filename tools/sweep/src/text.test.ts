import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import { tempRepo, writeFiles } from "./testing.ts";
import { refText } from "./text.ts";

it("reads repo files, and beads and memories from a run's snapshot", () => {
  const root = tempRepo({ "docs/a.md": "repo text" });
  const run = mkdtempSync(path.join(tmpdir(), "run-"));
  writeFiles(run, {
    "snapshot/index.json": JSON.stringify({
      "snapshot/beads/acme-x1.md": "bead:acme-x1",
      "snapshot/memories/rule.md": "memory:rule",
    }),
    "snapshot/beads/acme-x1.md": "bead text",
    "snapshot/memories/rule.md": "memory text",
  });
  const text = refText(root, run);
  expect(text("docs/a.md")).toBe("repo text");
  expect(text("bead:acme-x1")).toBe("bead text");
  expect(text("memory:rule")).toBe("memory text");
  expect(text("bead:acme-gone")).toBe("");
  expect(text("docs/missing.md")).toBe("");
});

it("reads beads and memories as empty without a run", () => {
  const root = tempRepo({});
  expect(refText(root)("bead:acme-x1")).toBe("");
});
