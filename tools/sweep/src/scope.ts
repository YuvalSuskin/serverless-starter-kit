// Which files the sweep reads (spec §4): the live set is swept, the archive is
// history (checked for links only), everything else is out.
import { execFileSync } from "node:child_process";

export type Scope = "live" | "archive" | "out";

// Outside facts kept by their own tools, generated output, and the sweep's own
// data.
const OUT = [
  // Agent working files: plan ledgers, review batches, the sweep's own runs.
  /^\.superpowers\//,
  /^docs\/competitors\//,
  /^docs\/sweeps\//,
  /^design\/fonts\//,
  /^design\/logo\//,
  /^design\/tokens\/tokens\.css$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)fixtures\//,
  /(^|\/)__snapshots__\//,
];

// The archive, and the review batches' drafts and records: history once a
// batch is applied.
const ARCHIVE = [/^docs\/archive\//, /^docs\/reviews\//];

const LIVE = /\.(md|ts|tsx|mts|js|mjs|css|json|ya?ml|py|html)$/;

export function classify(file: string): Scope {
  if (OUT.some((pattern) => pattern.test(file))) return "out";
  if (ARCHIVE.some((pattern) => pattern.test(file))) return "archive";
  return LIVE.test(file) ? "live" : "out";
}

/** Every file git tracks or would track (ignored files never), sorted. */
export function repoFiles(root: string): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  return [...new Set(out.split("\0").filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function liveFiles(root: string): string[] {
  return repoFiles(root).filter((file) => classify(file) === "live");
}
