// pnpm sweep timeline: when a side's text was written and last changed, by
// which commit and PR, and whether the owner approved it (spec §6, the card's
// timeline; §9, origins). Nearly every commit carries the Claude trailer, so
// approval is read from Decided:/Status: lines and review-batch commits first.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Run } from "./exec.ts";
import type { Origin, Side } from "./schema.ts";

interface Commit {
  sha: string;
  time: number;
  /** The author's own calendar day (their time zone, not UTC). */
  day: string;
  subject: string;
}

const DATE = /\d{4}-\d{2}-\d{2}/;
const UNCOMMITTED = /^0{40}$/;
// Commits made by tools, not typed by the owner, though they carry no trailer.
const TOOL_SUBJECT = /^(bd |probe:)/;

export function timeline(root: string, side: Side, run: Run): Origin {
  if (side.ref.startsWith("bead:")) return beadOrigin(side.ref.slice(5), run);
  if (side.ref.startsWith("memory:")) return memoryOrigin(side.ref.slice(7), run);

  const file = path.join(root, side.ref);
  if (!existsSync(file)) throw new Error(`${side.ref}: no such file`);
  const text = readFileSync(file, "utf8").split("\n");
  const lineCount = Math.max(1, text.at(-1) === "" ? text.length - 1 : text.length);
  const git = (...args: string[]) => run("git", args, { cwd: root });
  const range = (from: number, to: number) =>
    blame(
      git(
        "blame",
        "--porcelain",
        "-M",
        "-C",
        "-L",
        `${String(from)},${String(to)}`,
        "--",
        side.ref,
      ),
    );

  const lines = side.lines === undefined ? undefined : clamp(side.lines, lineCount);
  const all =
    lines === undefined
      ? history(git("log", "--follow", "--format=%H%x1f%at%x1f%ai%x1f%s", "--", side.ref))
      : range(...lines);
  const uncommitted = all.some((c) => UNCOMMITTED.test(c.sha));
  const commits = all.filter((c) => !UNCOMMITTED.test(c.sha)).sort((a, b) => a.time - b.time);
  const first = commits[0];
  const last = commits.at(-1);
  if (first === undefined || last === undefined)
    throw new Error(`${side.ref}: no committed history`);

  const approval = approvalOf(text, side.ref, lines, commits, uncommitted, {
    markerTime: (line) => range(line, line)[0]?.time ?? 0,
    trailers: (sha) => git("show", "-s", "--format=%(trailers:key=Co-Authored-By,valueonly)", sha),
  });
  const pr = /\(#(\d+)\)$/.exec(last.subject)?.[1];
  return {
    written: first.day,
    lastChanged: uncommitted ? "uncommitted" : last.day,
    ...(approval.approvedOn === undefined ? {} : { approvedOn: approval.approvedOn }),
    commit: last.sha,
    ...(pr === undefined ? {} : { pr: Number(pr) }),
    message: last.subject,
    ownerApproved: approval.ownerApproved,
    evidence: approval.evidence,
  };
}

function clamp(lines: [number, number], count: number): [number, number] {
  const to = Math.min(lines[1], count);
  return [Math.min(lines[0], to), to];
}

interface Approval {
  ownerApproved: boolean;
  approvedOn?: string;
  evidence: string;
}

function approvalOf(
  text: string[],
  ref: string,
  lines: [number, number] | undefined,
  commits: Commit[],
  uncommitted: boolean,
  git: { markerTime: (line: number) => number; trailers: (sha: string) => string },
): Approval {
  const marker =
    (lines === undefined ? undefined : decidedAbove(text, lines[0])) ?? statusLine(text);
  if (marker !== undefined) {
    // Approval covers the text as it stood when the marker was written.
    const approvedAt = git.markerTime(marker.line);
    const later = commits.find((c) => c.time > approvedAt);
    const where = `${marker.kind} line at ${ref}:${String(marker.line)}`;
    if (later !== undefined || uncommitted) {
      const by = later === undefined ? "uncommitted edits" : later.sha.slice(0, 7);
      return {
        ownerApproved: false,
        approvedOn: marker.date,
        evidence: `${where}, but changed after by ${by}`,
      };
    }
    return { ownerApproved: true, approvedOn: marker.date, evidence: where };
  }
  const owners = (c: Commit) =>
    c.subject.startsWith("Review batch") ||
    (!TOOL_SUBJECT.test(c.subject) && !/claude/i.test(git.trailers(c.sha)));
  if (!uncommitted && commits.every(owners)) {
    const batch = commits.find((c) => c.subject.startsWith("Review batch"));
    const evidence =
      batch === undefined
        ? "every commit is the owner's (no agent trailer)"
        : `review-batch apply commit ${batch.sha.slice(0, 7)}`;
    return { ownerApproved: true, evidence };
  }
  return {
    ownerApproved: false,
    evidence: "written in agent or tool commits, with no Decided: or Status: line",
  };
}

interface Marker {
  kind: "Decided:" | "Status:";
  date: string;
  line: number;
}

/** The nearest Decided: line above a line, within its own entry (any heading ends it). */
function decidedAbove(text: string[], lineNumber: number): Marker | undefined {
  for (let index = lineNumber - 1; index >= 0; index--) {
    const line = text[index] ?? "";
    const date = line.includes("Decided:") ? DATE.exec(line)?.[0] : undefined;
    if (date !== undefined) return { kind: "Decided:", date, line: index + 1 };
    if (/^#{1,4} /.test(line)) return undefined;
  }
  return undefined;
}

/** An approved **Status:** line in the header. */
function statusLine(text: string[]): Marker | undefined {
  const index = text.slice(0, 15).findIndex((line) => /^\*\*Status:\*\*.*approved/i.test(line));
  const date = index === -1 ? undefined : DATE.exec(text[index] ?? "")?.[0];
  return date === undefined ? undefined : { kind: "Status:", date, line: index + 1 };
}

function blame(porcelain: string): Commit[] {
  const commits = new Map<string, Commit & { tz: string }>();
  let current: (Commit & { tz: string }) | undefined;
  for (const line of porcelain.split("\n")) {
    const header = /^([0-9a-f]{40}) \d+ \d+/.exec(line);
    if (header) {
      const sha = header[1] ?? "";
      current = commits.get(sha) ?? { sha, time: 0, day: "", subject: "", tz: "+0000" };
      commits.set(sha, current);
    } else if (current !== undefined && line.startsWith("author-time ")) {
      current.time = Number(line.slice(12));
    } else if (current !== undefined && line.startsWith("author-tz ")) {
      current.tz = line.slice(10);
    } else if (current !== undefined && line.startsWith("summary ")) {
      current.subject = line.slice(8);
    }
  }
  return [...commits.values()].map(({ tz, ...commit }) => ({
    ...commit,
    day: localDay(commit.time, tz),
  }));
}

function history(log: string): Commit[] {
  return log
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [sha = "", time = "0", iso = "", subject = ""] = line.split("\u001f");
      return { sha, time: Number(time), day: iso.slice(0, 10), subject };
    });
}

/** The calendar day in the author's zone ("+0300"). */
function localDay(seconds: number, tz: string): string {
  const sign = tz.startsWith("-") ? -1 : 1;
  const offset = sign * (Number(tz.slice(1, 3)) * 3600 + Number(tz.slice(3, 5)) * 60);
  return new Date((seconds + offset) * 1000).toISOString().slice(0, 10);
}

interface BeadRecord {
  status?: string;
  labels?: string[];
  title?: string;
  created_at?: string;
  updated_at?: string;
  close_reason?: string;
}

function beadOrigin(id: string, run: Run): Origin {
  const shown = JSON.parse(run("bd", ["show", id, "--json"])) as BeadRecord | BeadRecord[];
  const bead = (Array.isArray(shown) ? shown[0] : shown) ?? {};
  const approvedReason = /approved/i.test(bead.close_reason ?? "");
  const decision = bead.status === "closed" && (bead.labels ?? []).includes("decision");
  const ownerApproved = approvedReason || decision;
  return {
    written: (bead.created_at ?? "").slice(0, 10),
    lastChanged: (bead.updated_at ?? "").slice(0, 10),
    commit: "",
    message: bead.title ?? "",
    ownerApproved,
    evidence: beadEvidence(id, approvedReason, decision),
  };
}

function beadEvidence(id: string, approvedReason: boolean, decision: boolean): string {
  if (approvedReason) return `bead ${id} closed as approved`;
  if (decision) return `bead ${id} closed as a decision`;
  return `bead ${id} is not a closed decision`;
}

function memoryOrigin(key: string, run: Run): Origin {
  const memories = JSON.parse(run("bd", ["memories", "--json"])) as Record<string, unknown>;
  const text = typeof memories[key] === "string" ? memories[key] : "";
  const date = DATE.exec(text)?.[0] ?? "";
  const ownerApproved = /\bowner\b/i.test(text);
  return {
    written: date,
    lastChanged: date,
    commit: "",
    message: "",
    ownerApproved,
    evidence: ownerApproved ? "the memory records the owner's rule" : "the memory names no owner",
  };
}
