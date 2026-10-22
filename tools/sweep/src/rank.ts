// pnpm sweep rank: which root causes go on the next batch (spec §7). Three
// signals, in order: what users see, what open work depends on, then graph
// reach. Reach alone favours whatever is written about most (process docs,
// duplicated rules), so it only breaks ties. A starting formula, tuned later
// from the ledger.
import type { Finding, Topic } from "./schema.ts";

export interface OpenBead {
  id: string;
  dependsOn: string[];
  /** Repo paths and stable IDs the bead's text names. */
  mentions: string[];
}

export interface Ranked {
  key: string;
  score: number;
  reach: number;
  blocks: number;
  userVisible: boolean;
}

const USER_VISIBLE = /^(docs\/product\/|frontend\/src\/)/;
const NOT_SHIPPED = /\.(test|stories)\.[cm]?[jt]sx?$/;
const REACH_CAP = 99;

export function rank(
  rootCauses: { key: string; findings: Finding[] }[],
  topics: Topic[],
  openBeads: OpenBead[],
): Ranked[] {
  return rootCauses
    .map(({ key, findings }): Ranked => {
      const sides = findings.flatMap((finding) => [...finding.sides, ...finding.reach]);
      const anchors = new Set(
        sides.flatMap((side) => [side.ref, side.stableId ?? ""]).filter(Boolean),
      );
      const userVisible = sides.some(
        (side) => USER_VISIBLE.test(side.ref) && !NOT_SHIPPED.test(side.ref),
      );
      // Open work that waits on this area: it depends on a bead side, or its
      // text names a side's file, folder or stable ID.
      const names = (mention: string) =>
        anchors.has(mention) ||
        (mention.endsWith("/") && [...anchors].some((a) => a.startsWith(mention)));
      const blocks = openBeads.filter(
        (bead) =>
          bead.dependsOn.some((id) => anchors.has(`bead:${id}`)) || bead.mentions.some(names),
      ).length;
      const touched = topics.filter((topic) => topic.files.some((file) => anchors.has(file)));
      const reach = Math.min(
        REACH_CAP,
        touched.reduce((sum, topic) => sum + topic.files.length + topic.neighbours.length, 0),
      );
      const score = (userVisible ? 10_000 : 0) + blocks * 100 + reach;
      return { key, score, reach, blocks, userVisible };
    })
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

const PATH =
  /(?:\.claude|docs|design|frontend|backend|packages|tools|infra)\/[\w./()[\]@-]*[\w)\]]/g;
const STABLE_ID = /\b[A-Z]{2,8}-[A-Z]{1,3}\d+\b|\b[A-Z]{1,3}\d{1,3}\b/g;

interface ExportedIssue {
  _type?: string;
  labels?: string[];
  id: string;
  status: string;
  title?: string;
  description?: string;
  design?: string;
  notes?: string;
  acceptance_criteria?: string;
  dependencies?: { depends_on_id: string }[];
}

/** Open beads from `bd export`, with the paths and IDs their text names. */
export function openBeadsFrom(exported: string): OpenBead[] {
  return (
    exported
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as ExportedIssue)
      .filter((issue) => (issue._type ?? "issue") === "issue" && issue.status !== "closed")
      // The sweep's own beads name every side of their findings: not work that waits.
      .filter((issue) => !(issue.labels ?? []).includes("sweep"))
      .map((issue) => {
        const text = [
          issue.title,
          issue.description,
          issue.design,
          issue.notes,
          issue.acceptance_criteria,
        ]
          .filter((part) => part !== undefined)
          .join("\n");
        const mentions = new Set(
          [...text.matchAll(PATH), ...text.matchAll(STABLE_ID)].map((m) => m[0]),
        );
        return {
          id: issue.id,
          dependsOn: (issue.dependencies ?? []).map((dep) => dep.depends_on_id),
          mentions: [...mentions].sort((a, b) => a.localeCompare(b)),
        };
      })
  );
}

/** The findings each open sweep bead holds (its design JSON), from `bd export`. */
export function openSweepFindings(exported: string): { bead: string; findings: Finding[] }[] {
  return exported
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as ExportedIssue & { labels?: string[] })
    .filter((issue) => (issue._type ?? "issue") === "issue" && issue.status !== "closed")
    .filter((issue) => (issue.labels ?? []).includes("sweep") && issue.design !== undefined)
    .flatMap((issue) => {
      try {
        const design = JSON.parse(issue.design ?? "") as { findings?: Finding[] };
        return design.findings === undefined ? [] : [{ bead: issue.id, findings: design.findings }];
      } catch {
        return [];
      }
    });
}
