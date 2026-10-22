import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

import { archivePaths, candidates } from "./archive.ts";
import { realRun, type Run } from "./exec.ts";
import { brokenLinks } from "./links.ts";
import { lint } from "./lint.ts";
import { tempRepo } from "./testing.ts";

interface FakeBead {
  id: string;
  status: string;
  parent?: string;
}

/** git for real; bd export answered from `beads`. */
function withBeads(beads: FakeBead[]): Run {
  return (cmd, args, opts) => {
    if (cmd === "git") return realRun(cmd, args, opts);
    if (args[0] === "export") {
      return beads
        .map((bead) =>
          JSON.stringify({
            id: bead.id,
            status: bead.status,
            dependencies:
              bead.parent === undefined
                ? []
                : [{ issue_id: bead.id, depends_on_id: bead.parent, type: "parent-child" }],
          }),
        )
        .join("\n");
    }
    throw new Error(`unexpected ${cmd} ${args.join(" ")}`);
  };
}

const SPEC = "docs/superpowers/specs/2026-09-26-preview-design.md";
const PLAN = "docs/superpowers/plans/2026-09-26-preview.md";
const specText = "# Preview\n\n**Status:** Approved\n**Beads:** epic `acme-5ss`\n\n## 1\n\nBody.\n";
const planText = `# Preview plan\n\n**Spec:** [\`${SPEC}\`](../specs/2026-09-26-preview-design.md)\n\n### Task 1\n`;

it("makes a spec and its plan one candidate when the epic and its children are closed", () => {
  const root = tempRepo({ [SPEC]: specText, [PLAN]: planText });
  const run = withBeads([
    { id: "acme-5ss", status: "closed" },
    { id: "acme-5ss.1", status: "closed", parent: "acme-5ss" },
  ]);
  expect(candidates(root, run)).toEqual([
    { files: [PLAN, SPEC], beads: ["acme-5ss"], status: "candidate" },
  ]);
});

it("keeps them live while one child is open", () => {
  const root = tempRepo({ [SPEC]: specText, [PLAN]: planText });
  const run = withBeads([
    { id: "acme-5ss", status: "closed" },
    { id: "acme-5ss.2", status: "open", parent: "acme-5ss" },
  ]);
  expect(candidates(root, run)[0]?.status).toBe("live");
});

it("calls a file that names no bead unlinked, and one naming an unknown bead unlinked too", () => {
  const root = tempRepo({
    "docs/research/r.md": "# Research\n\nNothing here.\n",
    "docs/research/q.md": "# Research\n\n**For:** acme-wide adoption.\n",
  });
  const out = candidates(root, withBeads([]));
  expect(out).toEqual([
    {
      files: ["docs/research/q.md"],
      beads: [],
      status: "unlinked",
      unknownBeads: ["acme-wide"],
    },
    { files: ["docs/research/r.md"], beads: [], status: "unlinked" },
  ]);
});

it("keeps a closed spec live while a CLAUDE.md or a skill cites it as the design", () => {
  const root = tempRepo({
    [SPEC]: specText,
    "tools/preview/CLAUDE.md": `# tools/preview\n\nDesign: \`${SPEC}\`.\n`,
  });
  const out = candidates(root, withBeads([{ id: "acme-5ss", status: "closed" }]));
  expect(out).toEqual([
    {
      files: [SPEC],
      beads: ["acme-5ss"],
      status: "live",
      citedBy: ["tools/preview/CLAUDE.md"],
    },
  ]);
});

it("never offers product specs, decision logs or CLAUDE.md files", () => {
  const root = tempRepo({
    "docs/product/sign-in.md": "# Sign in\n**Beads:** acme-5ss\n",
    "docs/decisions/d.md": "# D\n**Beads:** acme-5ss\n",
    "docs/superpowers/specs/CLAUDE.md": "# Rules\n",
  });
  expect(candidates(root, withBeads([{ id: "acme-5ss", status: "closed" }]))).toEqual([]);
});

it("moves files under docs/archive/ at the same path, and every link still resolves", () => {
  const root = tempRepo({
    [SPEC]: `${specText}\nSee [the plan](../plans/2026-09-26-preview.md#task-1) and [rules](../../../CLAUDE.md).\n`,
    [PLAN]: planText,
    "CLAUDE.md": "# Root\n",
    "docs/decisions/d.md": `Design: [preview](../superpowers/specs/2026-09-26-preview-design.md#1).\n\n\`\`\`md\n[fenced](../superpowers/specs/2026-09-26-preview-design.md)\n\`\`\`\n`,
    "docs/product/p.md": `Built by \`${SPEC}\`.\n`,
  });
  const moves = archivePaths(root, [SPEC, PLAN], realRun);
  expect(moves).toEqual([
    { from: SPEC, to: "docs/archive/superpowers/specs/2026-09-26-preview-design.md" },
    { from: PLAN, to: "docs/archive/superpowers/plans/2026-09-26-preview.md" },
  ]);
  expect(existsSync(path.join(root, SPEC))).toBe(false);
  expect(brokenLinks(root)).toEqual([]);

  const decisions = readFileSync(path.join(root, "docs/decisions/d.md"), "utf8");
  expect(decisions).toContain("(../archive/superpowers/specs/2026-09-26-preview-design.md#1)");
  expect(decisions).toContain("[fenced](../superpowers/specs/2026-09-26-preview-design.md)");
  const spec = readFileSync(
    path.join(root, "docs/archive/superpowers/specs/2026-09-26-preview-design.md"),
    "utf8",
  );
  expect(spec).toContain("(../plans/2026-09-26-preview.md#task-1)");
  expect(spec).toContain("(../../../../CLAUDE.md)");
  const product = readFileSync(path.join(root, "docs/product/p.md"), "utf8");
  expect(product).toContain("`docs/archive/superpowers/specs/2026-09-26-preview-design.md`");
});

it("refuses to archive a home or a file outside the live set", () => {
  const root = tempRepo({
    "docs/product/p.md": "x",
    "docs/decisions/d.md": "x",
    "frontend/CLAUDE.md": "x",
  });
  for (const file of [
    "docs/product/p.md",
    "docs/decisions/d.md",
    "frontend/CLAUDE.md",
    "docs/missing.md",
  ]) {
    expect(() => archivePaths(root, [file], realRun)).toThrow(/cannot be archived/);
  }
});

it("keeps the lint green after archiving a file on the unlinked list", () => {
  const root = tempRepo({
    [SPEC]: "# Preview\n\nNo bead.\n",
    "tools/sweep/src/unlinked.json": JSON.stringify([SPEC]),
  });
  archivePaths(root, [SPEC], realRun);
  expect(
    JSON.parse(readFileSync(path.join(root, "tools/sweep/src/unlinked.json"), "utf8")),
  ).toEqual([]);
  expect(lint(root)).toEqual([]);
});

it("rewrites mentions in code and config, but not in fenced code, decision logs or history", () => {
  const root = tempRepo({
    [SPEC]: specText,
    "turbo.json": `{ "inputs": ["$TURBO_ROOT$/${SPEC}"] }\n`,
    "tools/x/package.json": `{ "description": "Design: ${SPEC}" }\n`,
    "docs/product/p.md": `Built by \`${SPEC}\`.\n\n\`\`\`md\nQuoted: \`${SPEC}\`\n\`\`\`\n`,
    "docs/decisions/d.md": `DG20: see \`${SPEC}\`, and [the spec](../superpowers/specs/2026-09-26-preview-design.md).\n`,
    "docs/reviews/batch-1/x.md": `Drafted from \`${SPEC}\`.\n`,
  });
  archivePaths(root, [SPEC], realRun);
  const moved = "docs/archive/superpowers/specs/2026-09-26-preview-design.md";
  const read = (file: string) => readFileSync(path.join(root, file), "utf8");
  expect(read("turbo.json")).toContain(moved);
  expect(read("tools/x/package.json")).toContain(moved);
  expect(read("docs/product/p.md")).toContain(`Built by \`${moved}\`.`);
  expect(read("docs/product/p.md")).toContain(`Quoted: \`${SPEC}\``);
  expect(read("docs/decisions/d.md")).toContain(`DG20: see \`${SPEC}\``);
  expect(read("docs/decisions/d.md")).toContain(
    "(../archive/superpowers/specs/2026-09-26-preview-design.md)",
  );
  expect(read("docs/reviews/batch-1/x.md")).toContain(`Drafted from \`${SPEC}\``);
});

it("reports what cites an unlinked spec, and refuses to archive a cited file", () => {
  const root = tempRepo({
    [SPEC]: "# Preview\n\nNo bead.\n",
    "backend/CLAUDE.md": `Design: \`${SPEC}\`.\n`,
  });
  expect(candidates(root, withBeads([]))).toEqual([
    { files: [SPEC], beads: [], status: "unlinked", citedBy: ["backend/CLAUDE.md"] },
  ]);
  expect(() => archivePaths(root, [SPEC], realRun)).toThrow(/cited by backend\/CLAUDE\.md/);
});

it("keeps a spec live while a live spec, plan or research header builds on it, or a CLAUDE.md cites its area", () => {
  const backend = "docs/superpowers/specs/2026-09-25-backend-scaffold-design.md";
  const root = tempRepo({
    [SPEC]: specText,
    "docs/research/r.md": `# Audit\n\n**Beads:** acme-v60\n**Design:** \`${SPEC}\`\n`,
    [backend]: "# Backend\n\n**Beads:** acme-bk1\n",
    "CLAUDE.md": "Record per-event cost (backend spec §10.3).\n",
  });
  const run = withBeads([
    { id: "acme-5ss", status: "closed" },
    { id: "acme-v60", status: "open" },
    { id: "acme-bk1", status: "closed" },
  ]);
  const byFile = new Map(candidates(root, run).map((c) => [c.files[0], c]));
  expect(byFile.get(SPEC)).toMatchObject({ status: "live", citedBy: ["docs/research/r.md"] });
  expect(byFile.get(backend)).toMatchObject({ status: "live", citedBy: ["CLAUDE.md"] });
});

it("counts a header citation from a file kept live only by its instructions", () => {
  const trial = "docs/research/2026-09-29-design-guides-trial.md";
  const alignment = "docs/superpowers/specs/2026-09-29-design-alignment-design.md";
  const root = tempRepo({
    [trial]: "# Trial\n\n**For:** acme-h18\n",
    [alignment]: `# Alignment\n\n**Beads:** acme-e7s\n\nWhat the trial taught (\`${trial}\`).\n`,
    ".claude/skills/product-spec/SKILL.md": `Kit: \`${alignment}\`.\n`,
  });
  const run = withBeads([
    { id: "acme-h18", status: "closed" },
    { id: "acme-e7s", status: "closed" },
  ]);
  const byFile = new Map(candidates(root, run).map((c) => [c.files[0], c]));
  expect(byFile.get(trial)).toMatchObject({ status: "live", citedBy: [alignment] });
});
