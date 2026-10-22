import { expect, it } from "vitest";

import type { FindingLine } from "./schema.ts";

import { realRun, type Run } from "./exec.ts";
import { appendLedger } from "./ledger.ts";
import { sampleFinding, sampleFindingLine, tempRepo } from "./testing.ts";
import { verifyBatch } from "./verify.ts";

const SPEC = "docs/product/upload-files.md";
const CLAUDE = "frontend/CLAUDE.md";
const OLD = "Files may be up to 50 MB.";
const NEW = "Up to 20 MB per file.";

/** A settled finding: the spec (home) says 20 MB; frontend/CLAUDE.md said 50 MB and was rewritten. */
function line(overrides: Partial<FindingLine["resolution"]> = {}): FindingLine {
  const base = sampleFindingLine({
    finding: sampleFinding({
      sides: [
        { type: "product-spec", ref: SPEC, quote: NEW, stableId: "ADD-L1" },
        { type: "claude-md", ref: CLAUDE, quote: OLD },
      ],
    }),
  });
  return {
    ...base,
    resolution: {
      ...base.resolution,
      codePending: false,
      endState: {
        home: { type: "product-spec", ref: SPEC, quote: NEW },
        losing: [{ ref: CLAUDE, became: "rewritten", lostQuote: OLD }],
      },
      ...overrides,
    },
  };
}

/** git for real; bd with no beads or memories. */
const run: Run = (cmd, args, opts) => {
  if (cmd === "bd") return args[0] === "export" ? "" : "{}";
  return realRun(cmd, args, opts);
};

function repo(files: Record<string, string>, lines: FindingLine[] = [line()]): string {
  const root = tempRepo({ [SPEC]: `# Add files\n\n${NEW}\n`, [CLAUDE]: "# Frontend\n", ...files });
  for (const l of lines) appendLedger(root, l);
  return root;
}

it("passes when the losing text is gone everywhere and the winner is at home", () => {
  expect(verifyBatch(repo({}), 2, run, { skipCheck: true })).toEqual([]);
});

it("fails, naming the file, when the losing text survives in a place the card did not list", () => {
  const root = repo({ "backend/CLAUDE.md": `Uploads: ${OLD}\n` });
  expect(verifyBatch(root, 2, run, { skipCheck: true })).toEqual([
    `SW-001: losing text still in backend/CLAUDE.md: "${OLD}"`,
  ]);
});

it("finds the losing text even when the formatter re-wrapped it", () => {
  const root = repo({ [CLAUDE]: "# Frontend\n\nFiles may be\nup to 50 MB.\n" });
  expect(verifyBatch(root, 2, run, { skipCheck: true })).toEqual([
    `SW-001: losing text still in ${CLAUDE}: "${OLD}"`,
  ]);
});

it("fails when the winning text is missing from its home", () => {
  const root = repo({ [SPEC]: "# Add files\n\nSomething else.\n" });
  expect(verifyBatch(root, 2, run, { skipCheck: true })).toEqual([
    `SW-001: winning text missing from ${SPEC}: "${NEW}"`,
  ]);
});

it("fails when a link broke", () => {
  const root = repo({ "docs/decisions/d.md": "[gone](missing.md)\n" });
  expect(verifyBatch(root, 2, run, { skipCheck: true })).toEqual([
    "docs/decisions/d.md: broken link missing.md",
  ]);
});

it("leaves old text where it is kept on purpose: history, reviews, and superseded decisions", () => {
  const root = repo({
    "docs/archive/plans/p.md": `${OLD}\n`,
    "docs/reviews/batch-2/acme-x.md": `${OLD}\n`,
    "docs/decisions/d.md": `## Uploads\n\n### B4\n\n~~${OLD}~~ Superseded by B9, 2026-10-02.\n`,
  });
  expect(verifyBatch(root, 2, run, { skipCheck: true })).toEqual([]);
});

it("still fails on old text in a decision entry that is not marked superseded", () => {
  const root = repo({ "docs/decisions/d.md": `### B4\n\n${OLD}\n\n### B5\n\nSuperseded by B9.\n` });
  expect(verifyBatch(root, 2, run, { skipCheck: true })).toEqual([
    `SW-001: losing text still in docs/decisions/d.md: "${OLD}"`,
  ]);
});

it("skips a pending code side, which waits for its bug bead", () => {
  const code = "backend/src/upload.ts";
  const pending = line({
    codePending: true,
    endState: {
      home: { type: "product-spec", ref: SPEC, quote: NEW },
      losing: [{ ref: code, became: "rewritten", lostQuote: "MAX = 50" }],
    },
  });
  pending.finding.sides.push({ type: "code", ref: code, quote: "MAX = 50" });
  const root = repo({ [code]: "export const MAX = 50;\n" }, [pending]);
  expect(verifyBatch(root, 2, run, { skipCheck: true })).toEqual([]);
});

it("checks only the batch it is given", () => {
  const root = repo({ "backend/CLAUDE.md": `${OLD}\n` });
  expect(verifyBatch(root, 3, run, { skipCheck: true })).toEqual([]);
});

it("judges a decision table row by row: one superseded row does not excuse another", () => {
  const table = [
    "## Decided",
    "",
    "| # | Decision |",
    "| --- | --- |",
    "| B3 | Something else. Superseded by B9. |",
    `| B4 | ${OLD} |`,
    "",
  ].join("\n");
  const root = repo({ "docs/decisions/d.md": table });
  expect(verifyBatch(root, 2, run, { skipCheck: true })).toEqual([
    `SW-001: losing text still in docs/decisions/d.md: "${OLD}"`,
  ]);
});

it("accepts the repo's other ways of marking an old decision", () => {
  for (const marked of [
    `| B10 | ~~${OLD}~~ **Amended by O16:** 20 MB |`,
    `Likely answer (superseded, see Decided): ${OLD}`,
    `_Superseded in part_: ${OLD}`,
  ]) {
    const root = repo({ "docs/decisions/d.md": `## Log\n\n${marked}\n` });
    expect(verifyBatch(root, 2, run, { skipCheck: true })).toEqual([]);
  }
});

it("reads closed decision beads, and treats sweep and review beads as records", () => {
  const settledInBead = line();
  settledInBead.resolution.endState.home = { type: "bead", ref: "bead:acme-d1", quote: NEW };
  const beads: Run = (cmd, args, opts) => {
    if (cmd === "bd" && args[0] === "export") {
      return [
        {
          id: "acme-d1",
          status: "closed",
          labels: ["decision"],
          title: "Uploads",
          description: NEW,
        },
        {
          id: "acme-q1",
          status: "open",
          labels: ["sweep", "sweep-queue"],
          title: "Queued",
          description: OLD,
        },
      ]
        .map((bead) => JSON.stringify(bead))
        .join("\n");
    }
    return run(cmd, args, opts);
  };
  const root = repo({}, [settledInBead]);
  expect(verifyBatch(root, 2, beads, { skipCheck: true })).toEqual([]);
});

it("still searches the docs for a pending code side's text, skipping only the code", () => {
  const code = "backend/src/upload.ts";
  const pending = line({
    codePending: true,
    endState: {
      home: { type: "product-spec", ref: SPEC, quote: NEW },
      losing: [{ ref: code, became: "rewritten", lostQuote: "MAX = 50" }],
    },
  });
  pending.finding.sides.push({ type: "code", ref: code, quote: "MAX = 50" });
  const root = repo({ [code]: "export const MAX = 50;\n", "backend/CLAUDE.md": "MAX = 50 MB.\n" }, [
    pending,
  ]);
  expect(verifyBatch(root, 2, run, { skipCheck: true })).toEqual([
    'SW-001: losing text still in backend/CLAUDE.md: "MAX = 50"',
  ]);
});

it("skips a superseded decision bead and the batch's own bug beads, but reads review beads", () => {
  const bug = line({ beads: ["acme-bug1"] });
  const beads: Run = (cmd, args, opts) => {
    if (cmd === "bd" && args[0] === "export") {
      return [
        {
          id: "acme-old",
          status: "closed",
          labels: ["decision"],
          close_reason: "Superseded by acme-new",
          description: OLD,
        },
        {
          id: "acme-old2",
          status: "closed",
          labels: ["decision"],
          description: OLD,
          dependencies: [{ depends_on_id: "acme-new", type: "supersedes" }],
        },
        {
          id: "acme-bug1",
          status: "open",
          labels: ["bug"],
          description: `Code still says ${OLD}`,
        },
        { id: "acme-spec", status: "open", labels: ["review", "batch-2"], description: OLD },
      ]
        .map((bead) => JSON.stringify(bead))
        .join("\n");
    }
    return run(cmd, args, opts);
  };
  const root = repo({}, [bug]);
  expect(verifyBatch(root, 2, beads, { skipCheck: true })).toEqual([
    `SW-001: losing text still in bead:acme-spec: "${OLD}"`,
  ]);
});

it("leaves old text in an executed plan, which says what was planned then", () => {
  const root = repo({ "docs/superpowers/plans/2026-09-26-uploads.md": `- Task 3: ${OLD}\n` });
  expect(verifyBatch(root, 2, run, { skipCheck: true })).toEqual([]);
});

it("still reads the plans' CLAUDE.md, a live how-to", () => {
  const root = repo({ "docs/superpowers/plans/CLAUDE.md": `# Plans\n\n${OLD}\n` });
  expect(verifyBatch(root, 2, run, { skipCheck: true })).toEqual([
    `SW-001: losing text still in docs/superpowers/plans/CLAUDE.md: "${OLD}"`,
  ]);
});

it("leaves old text in a design spec's entry marked superseded, but not in an unmarked one", () => {
  const spec = "docs/superpowers/specs/2026-09-26-uploads-design.md";
  const marked = repo({
    [spec]: `## Limits\n\n~~${OLD}~~ Superseded by B9.\n\n## Other\n\nFine.\n`,
  });
  expect(verifyBatch(marked, 2, run, { skipCheck: true })).toEqual([]);
  const unmarked = repo({ [spec]: `## Limits\n\n${OLD}\n\n## Other\n\nSuperseded by B9.\n` });
  expect(verifyBatch(unmarked, 2, run, { skipCheck: true })).toEqual([
    `SW-001: losing text still in ${spec}: "${OLD}"`,
  ]);
});

/** bd export holding `beads`; everything else as `run`. */
function exporting(beads: object[]): Run {
  return (cmd, args, opts) => {
    if (cmd === "bd" && args[0] === "export") return beads.map((b) => JSON.stringify(b)).join("\n");
    return run(cmd, args, opts);
  };
}

it("keeps the earlier comments of a closed decision bead superseded in part", () => {
  const beads = exporting([
    {
      id: "acme-d2",
      status: "closed",
      labels: ["decision"],
      title: "Uploads",
      comments: [{ text: `Decided: ${OLD}` }, { text: "Superseded in part by acme-d9: 20 MB." }],
    },
  ]);
  expect(verifyBatch(repo({}), 2, beads, { skipCheck: true })).toEqual([]);
});

it("still reads a closed decision bead in full when none of its comments is marked", () => {
  const beads = exporting([
    {
      id: "acme-d2",
      status: "closed",
      labels: ["decision"],
      title: "Uploads",
      comments: [{ text: `Decided: ${OLD}` }, { text: "Applied in batch 2." }],
    },
  ]);
  expect(verifyBatch(repo({}), 2, beads, { skipCheck: true })).toEqual([
    `SW-001: losing text still in bead:acme-d2: "${OLD}"`,
  ]);
});

it("looks the winner up directly when its home is outside the live texts", () => {
  const atBead = line();
  atBead.resolution.endState.home = { type: "bead", ref: "bead:acme-c1", quote: NEW };
  const shown: Run = (cmd, args, opts) => {
    if (cmd === "bd" && args[0] === "show" && args[1] === "acme-c1") {
      const bead = { id: "acme-c1", status: "closed", title: "Limit", close_reason: NEW };
      return JSON.stringify([bead]);
    }
    return run(cmd, args, opts);
  };
  expect(verifyBatch(repo({}, [atBead]), 2, shown, { skipCheck: true })).toEqual([]);
  // The same bead unknown to bd: the winner is missing.
  expect(verifyBatch(repo({}, [atBead]), 2, run, { skipCheck: true })).toEqual([
    `SW-001: winning text missing from bead:acme-c1: "${NEW}"`,
  ]);

  const review = "docs/reviews/batch-2/acme-x.md";
  const atReview = line();
  atReview.resolution.endState.home = { type: "decision", ref: review, quote: NEW };
  expect(
    verifyBatch(repo({ [review]: `${NEW}\n` }, [atReview]), 2, run, { skipCheck: true }),
  ).toEqual([]);
});
