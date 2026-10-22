// Test helpers for @acme/sweep: throwaway git repos and sample records.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Finding, FindingLine, Topic } from "./schema.ts";

/** A temp git repo holding `files` (repo-relative path to content), committed once. */
export function tempRepo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "sweep-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  writeFiles(root, files);
  git(root, "add", "-A");
  git(root, "commit", "-q", "--allow-empty", "-m", "initial");
  return root;
}

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(root, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

/** Commits `files` (and a `git mv` of each `moves` pair) with a given message and date. */
export function commit(
  root: string,
  change: { files?: Record<string, string>; moves?: [string, string][] },
  message: string,
  date: string,
): string {
  writeFiles(root, change.files ?? {});
  for (const [from, to] of change.moves ?? []) {
    mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
    git(root, "mv", from, to);
  }
  git(root, "add", "-A");
  execFileSync("git", ["commit", "-q", "-m", message], {
    cwd: root,
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
  return git(root, "rev-parse", "HEAD").trim();
}

export function sampleFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "SW-001",
    fingerprint: "abc123",
    kind: "conflict",
    topic: "Uploads",
    claim: "The largest file a visitor may upload",
    rootCause: "upload-limit",
    sides: [
      {
        type: "product-spec",
        ref: "docs/product/upload-files.md",
        lines: [10, 11],
        quote: "Up to 20 MB per file.",
        stableId: "ADD-L1",
      },
      {
        type: "code",
        ref: "backend/src/domain/upload.ts",
        lines: [4, 4],
        quote: "const MAX_BYTES = 50 * 1024 * 1024;",
      },
    ],
    reach: [],
    proposedFix: "Set the limit in code to 20 MB.",
    prediction: {
      winner: 0,
      rule: "product spec outranks code on what users see",
      confidence: "high",
    },
    ...overrides,
  };
}

export function sampleFindingLine(overrides: Partial<FindingLine> = {}): FindingLine {
  return {
    finding: sampleFinding(),
    found: { run: "2026-10-01-1", date: "2026-10-01", commit: "cc3749d" },
    foundBy: "sweep",
    rank: 1,
    origins: [],
    context: { firstSide: 0, gapDays: 2, testCovered: false },
    owner: { answer: "winner", winner: 0, note: "", batch: 2, round: 1, date: "2026-10-02" },
    resolution: {
      endState: {
        home: sampleFinding().sides[0] ?? null,
        losing: [
          {
            ref: "backend/src/domain/upload.ts",
            became: "rewritten",
            lostQuote: "const MAX_BYTES = 50 * 1024 * 1024;",
          },
        ],
      },
      codePending: true,
      commits: [],
      beads: ["acme-xyz"],
      vanished: [],
    },
    ...overrides,
  };
}

export function sampleTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    name: "Uploads",
    files: ["docs/product/upload-files.md"],
    passages: [{ ref: "docs/product/upload-files.md", lines: [10, 11] }],
    codePaths: ["backend/src/domain/upload.ts"],
    neighbours: ["Downloads"],
    ...overrides,
  };
}
