import { expect, it } from "vitest";

import type { Finding, Topic } from "./schema.ts";

import { openBeadsFrom, openSweepFindings, rank } from "./rank.ts";
import { sampleFinding, sampleTopic } from "./testing.ts";

const at = (ref: string, type: Finding["sides"][number]["type"] = "claude-md"): Finding =>
  sampleFinding({ sides: [{ type, ref, quote: "x" }] });

const topics: Topic[] = [
  sampleTopic({
    name: "Process",
    files: ["CLAUDE.md", "docs/superpowers/plans/CLAUDE.md", "a.md", "b.md", "c.md", "d.md"],
    neighbours: ["X", "Y", "Z"],
  }),
  sampleTopic({
    name: "Uploads",
    files: ["docs/product/uploads.md", "tools/x.md"],
    neighbours: [],
  }),
];

it("puts a finding that touches what users see above an equal one that does not", () => {
  const ranked = rank(
    [
      { key: "internal", findings: [at("tools/x.md")] },
      { key: "visible", findings: [at("docs/product/uploads.md", "product-spec")] },
    ],
    topics,
    [],
  );
  expect(ranked.map((r) => r.key)).toEqual(["visible", "internal"]);
  expect(ranked[0]?.userVisible).toBe(true);
});

it("puts a root cause that open work depends on above one nothing depends on", () => {
  const openBeads = ["a", "b", "c"].map((id) => ({
    id: `acme-${id}`,
    dependsOn: [],
    mentions: ["tools/x.md"],
  }));
  const ranked = rank(
    [
      { key: "quiet", findings: [at("tools/y.md")] },
      { key: "blocking", findings: [at("tools/x.md")] },
    ],
    topics,
    openBeads,
  );
  expect(ranked.map((r) => r.key)).toEqual(["blocking", "quiet"]);
  expect(ranked[0]?.blocks).toBe(3);
});

it("never lets graph reach alone lift a process-doc duplicate above a user-visible conflict", () => {
  const ranked = rank(
    [
      { key: "duplicate", findings: [at("CLAUDE.md")] },
      { key: "conflict", findings: [at("docs/product/uploads.md", "product-spec")] },
    ],
    topics,
    [],
  );
  expect(ranked.map((r) => r.key)).toEqual(["conflict", "duplicate"]);
  // The duplicate sits in the busier topic, and still ranks lower.
  expect(ranked[1]?.reach ?? 0).toBeGreaterThan(ranked[0]?.reach ?? 0);
});

it("reads open beads, what they depend on and what they name, from bd export", () => {
  const exported = [
    {
      _type: "issue",
      id: "acme-a1",
      status: "open",
      title: "Build uploads (ADD-L1)",
      description: "Per docs/product/uploads.md.",
      dependencies: [{ issue_id: "acme-a1", depends_on_id: "acme-b2", type: "blocks" }],
    },
    { _type: "issue", id: "acme-b2", status: "closed", title: "Done" },
  ]
    .map((line) => JSON.stringify(line))
    .join("\n");
  expect(openBeadsFrom(exported)).toEqual([
    {
      id: "acme-a1",
      dependsOn: ["acme-b2"],
      mentions: ["ADD-L1", "docs/product/uploads.md"],
    },
  ]);
});

it("counts open beads that depend on a bead side, and mentions of a folder", () => {
  const onBead = sampleFinding({ sides: [{ type: "bead", ref: "bead:acme-x1", quote: "x" }] });
  const inFolder = at("docs/product/uploads.md", "product-spec");
  const ranked = rank(
    [
      { key: "bead", findings: [onBead] },
      { key: "folder", findings: [inFolder] },
    ],
    topics,
    [
      { id: "acme-a", dependsOn: ["acme-x1"], mentions: [] },
      { id: "acme-b", dependsOn: [], mentions: ["docs/product/"] },
    ],
  );
  const blocks = Object.fromEntries(ranked.map((r) => [r.key, r.blocks]));
  expect(blocks).toEqual({ bead: 1, folder: 1 });
});

it("counts every frontend source file users see, but not its tests or stories", () => {
  const ranked = rank(
    [
      { key: "pricing", findings: [at("frontend/src/lib/content/tiers.ts", "code")] },
      { key: "test", findings: [at("frontend/src/lib/content/tiers.test.ts", "test")] },
      { key: "story", findings: [at("frontend/src/ui/button.stories.tsx", "code")] },
    ],
    topics,
    [],
  );
  const visible = Object.fromEntries(ranked.map((r) => [r.key, r.userVisible]));
  expect(visible).toEqual({ pricing: true, test: false, story: false });
});

it("reads the findings each open sweep bead holds, from bd export", () => {
  const finding = { ...sampleFinding(), id: "SW-003" };
  const exported = [
    {
      _type: "issue",
      id: "acme-s1",
      status: "open",
      labels: ["sweep"],
      design: JSON.stringify({ findings: [finding] }),
    },
    {
      _type: "issue",
      id: "acme-s2",
      status: "closed",
      labels: ["sweep"],
      design: JSON.stringify({ findings: [finding] }),
    },
    { _type: "issue", id: "acme-x", status: "open", labels: [], design: "{}" },
  ]
    .map((line) => JSON.stringify(line))
    .join("\n");
  expect(openSweepFindings(exported)).toEqual([{ bead: "acme-s1", findings: [finding] }]);
});

it("does not count the sweep's own beads as work that waits on an area", () => {
  const exported = [
    {
      _type: "issue",
      id: "acme-s1",
      status: "open",
      labels: ["sweep", "sweep-queue"],
      description: "docs/product/uploads.md",
    },
    {
      _type: "issue",
      id: "acme-a1",
      status: "open",
      labels: ["review"],
      description: "docs/product/uploads.md",
    },
  ]
    .map((line) => JSON.stringify(line))
    .join("\n");
  expect(openBeadsFrom(exported).map((bead) => bead.id)).toEqual(["acme-a1"]);
});
