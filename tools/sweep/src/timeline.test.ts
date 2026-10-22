import { expect, it } from "vitest";

import { realRun, type Run } from "./exec.ts";
import { commit, tempRepo, writeFiles } from "./testing.ts";
import { timeline } from "./timeline.ts";

const AGENT = "\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>";
/** git for real; bd must not be called for a file side. */
const noBd: Run = (cmd, args, opts) => {
  if (cmd !== "git") throw new Error(`${cmd} not expected`);
  return realRun(cmd, args, opts);
};

it("dates a range from the commit that wrote it and the one that last changed it", () => {
  const root = tempRepo({});
  commit(
    root,
    { files: { "docs/a.md": "one\ntwo\nthree\n" } },
    `Write a${AGENT}`,
    "2026-09-20T10:00:00Z",
  );
  const later = commit(
    root,
    { files: { "docs/a.md": "one\nTWO\nthree\n" } },
    `Change two (#22)${AGENT}`,
    "2026-09-25T10:00:00Z",
  );
  const origin = timeline(
    root,
    { type: "plan", ref: "docs/a.md", lines: [1, 3], quote: "one" },
    noBd,
  );
  expect(origin.written).toBe("2026-09-20");
  expect(origin.lastChanged).toBe("2026-09-25");
  expect(origin.commit).toBe(later);
  expect(origin.pr).toBe(22);
  expect(origin.message).toBe("Change two (#22)");
});

it("dates a whole file from its history when the side has no lines", () => {
  const root = tempRepo({});
  commit(root, { files: { "docs/a.md": "x\n" } }, `Write${AGENT}`, "2026-09-20T10:00:00Z");
  commit(root, { files: { "docs/a.md": "y\n" } }, `Change${AGENT}`, "2026-09-22T10:00:00Z");
  const origin = timeline(root, { type: "plan", ref: "docs/a.md", quote: "y" }, noBd);
  expect([origin.written, origin.lastChanged]).toEqual(["2026-09-20", "2026-09-22"]);
});

it("keeps the written date of text moved into the archive", () => {
  const root = tempRepo({});
  commit(
    root,
    { files: { "docs/plans/p.md": "a plan\nline two\n" } },
    `Plan${AGENT}`,
    "2026-09-20T10:00:00Z",
  );
  commit(
    root,
    { moves: [["docs/plans/p.md", "docs/archive/plans/p.md"]] },
    `Archive${AGENT}`,
    "2026-10-01T10:00:00Z",
  );
  const ranged = timeline(
    root,
    { type: "plan", ref: "docs/archive/plans/p.md", lines: [1, 2], quote: "a plan" },
    noBd,
  );
  expect(ranged.written).toBe("2026-09-20");
  const whole = timeline(
    root,
    { type: "plan", ref: "docs/archive/plans/p.md", quote: "a plan" },
    noBd,
  );
  expect(whole.written).toBe("2026-09-20");
});

it("reads approval from a Decided line above the text", () => {
  const root = tempRepo({});
  const text =
    "# Decisions\n\n## B4 — Uploads\n\n**Decided:** 2026-09-26, Yuval Suskin.\n\nFiles up to 20 MB.\n";
  commit(
    root,
    { files: { "docs/decisions/d.md": text } },
    `Record B4${AGENT}`,
    "2026-09-26T10:00:00Z",
  );
  const origin = timeline(
    root,
    { type: "decision", ref: "docs/decisions/d.md", lines: [7, 7], quote: "Files up to 20 MB." },
    noBd,
  );
  expect(origin.ownerApproved).toBe(true);
  expect(origin.approvedOn).toBe("2026-09-26");
  expect(origin.evidence).toContain("Decided:");
});

it("does not carry a Decided line across a heading into another decision", () => {
  const root = tempRepo({});
  const text = "## B4\n\n**Decided:** 2026-09-26.\n\n## B5\n\nStill open.\n";
  commit(root, { files: { "docs/decisions/d.md": text } }, `Log${AGENT}`, "2026-09-26T10:00:00Z");
  const origin = timeline(
    root,
    { type: "decision", ref: "docs/decisions/d.md", lines: [7, 7], quote: "Still open." },
    noBd,
  );
  expect(origin.ownerApproved).toBe(false);
});

it("reads approval from a Status header", () => {
  const root = tempRepo({});
  const text = "# A design\n\n**Status:** Approved 2026-09-24. Revised later.\n\n## 1\n\nBody.\n";
  commit(root, { files: { "docs/specs/s.md": text } }, `Spec${AGENT}`, "2026-09-24T10:00:00Z");
  const origin = timeline(
    root,
    { type: "design-spec", ref: "docs/specs/s.md", lines: [7, 7], quote: "Body." },
    noBd,
  );
  expect(origin.ownerApproved).toBe(true);
  expect(origin.approvedOn).toBe("2026-09-24");
});

it("counts a review-batch apply commit, or a commit without the agent trailer, as the owner's", () => {
  const root = tempRepo({});
  commit(
    root,
    { files: { "docs/a.md": "x\n" } },
    `Review batch 1: owner's answers applied (round 1) (#23)${AGENT}`,
    "2026-09-30T10:00:00Z",
  );
  commit(root, { files: { "docs/b.md": "y\n" } }, "Owner's own edit", "2026-09-30T11:00:00Z");
  commit(root, { files: { "docs/c.md": "z\n" } }, `Agent edit${AGENT}`, "2026-09-30T12:00:00Z");
  const side = (ref: string) => ({
    type: "plan" as const,
    ref,
    lines: [1, 1] as [number, number],
    quote: "x",
  });
  expect(timeline(root, side("docs/a.md"), noBd).ownerApproved).toBe(true);
  expect(timeline(root, side("docs/b.md"), noBd).ownerApproved).toBe(true);
  const agent = timeline(root, side("docs/c.md"), noBd);
  expect(agent.ownerApproved).toBe(false);
  expect(agent.evidence).toMatch(/agent/);
});

it("dates a bead side from bd, and counts a closed decision bead as approved", () => {
  const bd: Run = (_cmd, args) => {
    expect(args).toEqual(["show", "acme-yx7.1", "--json"]);
    return JSON.stringify([
      {
        id: "acme-yx7.1",
        status: "closed",
        labels: ["decision"],
        created_at: "2026-09-25T09:00:00Z",
        updated_at: "2026-09-26T12:00:00Z",
        close_reason: "Approved in review batch 1, round 1.",
      },
    ]);
  };
  const origin = timeline("/nowhere", { type: "bead", ref: "bead:acme-yx7.1", quote: "x" }, bd);
  expect([origin.written, origin.lastChanged]).toEqual(["2026-09-25", "2026-09-26"]);
  expect(origin.ownerApproved).toBe(true);
});

it("dates a memory from the date its text records", () => {
  const bd: Run = (_cmd, args) => {
    expect(args).toEqual(["memories", "--json"]);
    return JSON.stringify({
      "pay-per-use": "Owner principle (2026-09-30): idle costs nothing.",
      schema_version: 1,
    });
  };
  const origin = timeline(
    "/nowhere",
    { type: "memory", ref: "memory:pay-per-use", quote: "idle" },
    bd,
  );
  expect(origin.written).toBe("2026-09-30");
  expect(origin.ownerApproved).toBe(true);
});

it("stops at any heading, so an open ### entry never borrows the previous entry's Decided line", () => {
  const root = tempRepo({});
  const text =
    "## Open\n\n### O7\n\n**Decided:** 2026-09-26.\n\nMonitoring.\n\n### O9\n\nStill open.\n";
  commit(root, { files: { "docs/decisions/d.md": text } }, `Log${AGENT}`, "2026-09-26T10:00:00Z");
  const origin = timeline(
    root,
    { type: "decision", ref: "docs/decisions/d.md", lines: [11, 11], quote: "Still open." },
    noBd,
  );
  expect(origin.ownerApproved).toBe(false);
});

it("approves a range only if every commit in it is the owner's", () => {
  const root = tempRepo({});
  commit(root, { files: { "docs/a.md": "owner line\n" } }, "Owner's edit", "2026-09-20T10:00:00Z");
  commit(
    root,
    { files: { "docs/a.md": "owner line\nagent line\n" } },
    `Agent edit${AGENT}`,
    "2026-09-21T10:00:00Z",
  );
  const origin = timeline(
    root,
    { type: "plan", ref: "docs/a.md", lines: [1, 2], quote: "owner line" },
    noBd,
  );
  expect(origin.ownerApproved).toBe(false);
});

it("does not count tool commits without the trailer as the owner's", () => {
  const root = tempRepo({});
  commit(
    root,
    { files: { "CLAUDE.md": "generated\n" } },
    "bd init: initialize beads issue tracking",
    "2026-09-20T10:00:00Z",
  );
  const origin = timeline(
    root,
    { type: "claude-md", ref: "CLAUDE.md", lines: [1, 1], quote: "generated" },
    noBd,
  );
  expect(origin.ownerApproved).toBe(false);
});

it("does not call text approved when it changed after its Status line was approved", () => {
  const root = tempRepo({});
  const spec = (body: string) =>
    `# A design\n\n**Status:** Approved 2026-09-24.\n\n## 1\n\n${body}\n`;
  commit(
    root,
    { files: { "docs/specs/s.md": spec("Body.") } },
    `Spec${AGENT}`,
    "2026-09-24T10:00:00Z",
  );
  commit(
    root,
    { files: { "docs/specs/s.md": spec("Body, changed later.") } },
    `Later edit${AGENT}`,
    "2026-09-27T10:00:00Z",
  );
  const origin = timeline(
    root,
    { type: "design-spec", ref: "docs/specs/s.md", lines: [7, 7], quote: "Body" },
    noBd,
  );
  expect(origin.ownerApproved).toBe(false);
  expect(origin.evidence).toMatch(/changed after/);
});

it("dates a commit by its author's own day, not UTC's", () => {
  const root = tempRepo({});
  commit(
    root,
    { files: { "docs/a.md": "x\n" } },
    `Late night${AGENT}`,
    "2026-09-30T00:22:00+03:00",
  );
  const ranged = timeline(
    root,
    { type: "plan", ref: "docs/a.md", lines: [1, 1], quote: "x" },
    noBd,
  );
  const whole = timeline(root, { type: "plan", ref: "docs/a.md", quote: "x" }, noBd);
  expect([ranged.written, whole.written]).toEqual(["2026-09-30", "2026-09-30"]);
});

it("survives uncommitted edits, a range past the end, and names a missing file", () => {
  const root = tempRepo({});
  commit(root, { files: { "docs/a.md": "one\ntwo\n" } }, `Write${AGENT}`, "2026-09-20T10:00:00Z");
  writeFiles(root, { "docs/a.md": "one\nTWO\n" });
  const edited = timeline(
    root,
    { type: "plan", ref: "docs/a.md", lines: [1, 2], quote: "one" },
    noBd,
  );
  expect(edited.lastChanged).toBe("uncommitted");
  const past = timeline(
    root,
    { type: "plan", ref: "docs/a.md", lines: [1, 40], quote: "one" },
    noBd,
  );
  expect(past.written).toBe("2026-09-20");
  expect(() =>
    timeline(root, { type: "plan", ref: "docs/gone.md", lines: [1, 1], quote: "x" }, noBd),
  ).toThrow(/docs\/gone\.md: no such file/);
});
