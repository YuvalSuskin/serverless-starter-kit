// Everything preview keeps about a worktree lives in <worktree>/.preview/,
// which ignores itself, so it stays out of git on every branch.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Ports } from "./naming.ts";

export interface PreviewState {
  bead: string | undefined;
  branch: string | undefined;
  /** api is undefined for a branch without backend/. */
  pids: { api: number | undefined; web: number };
  ports: Ports;
  slug: string;
  startedAt: string;
  target: string;
  version: 1;
}

const previewDir = (worktree: string) => path.join(worktree, ".preview");
const file = (worktree: string, name: string) => path.join(previewDir(worktree), name);

export function ensurePreviewDir(worktree: string): void {
  mkdirSync(previewDir(worktree), { recursive: true });
  writeFileSync(file(worktree, ".gitignore"), "*\n");
}

export function readState(worktree: string): PreviewState | undefined {
  try {
    const parsed = JSON.parse(readFileSync(file(worktree, "state.json"), "utf8")) as {
      version?: unknown;
    };
    return parsed.version === 1 ? (parsed as PreviewState) : undefined;
  } catch {
    return undefined;
  }
}

export function writeState(worktree: string, state: PreviewState): void {
  ensurePreviewDir(worktree);
  writeFileSync(file(worktree, "state.json"), `${JSON.stringify(state, null, 2)}\n`);
}

export function clearState(worktree: string): void {
  rmSync(file(worktree, "state.json"), { force: true });
}

export function markCreated(worktree: string): void {
  ensurePreviewDir(worktree);
  writeFileSync(file(worktree, "created-by-preview"), "");
}

export function wasCreatedByPreview(worktree: string): boolean {
  return existsSync(file(worktree, "created-by-preview"));
}

export function readLockHash(worktree: string): string | undefined {
  try {
    return readFileSync(file(worktree, "lock-hash"), "utf8").trim();
  } catch {
    return undefined;
  }
}

export function writeLockHash(worktree: string, hash: string): void {
  ensurePreviewDir(worktree);
  writeFileSync(file(worktree, "lock-hash"), `${hash}\n`);
}

export function logPath(worktree: string, name: "api" | "web"): string {
  return file(worktree, `${name}.log`);
}
