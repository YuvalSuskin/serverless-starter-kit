// Test helpers: a writable copy of a fixture folder, laid out like the repo
// (<root>/docs/competitors, <root>/docs/product), and in-place edits to it.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

/** Copies fixtures/<name> to a fresh temporary folder and returns its path. */
export function fixtureRoot(name: string): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "competitors-test-")));
  cpSync(path.join(FIXTURES, name), root, { recursive: true });
  return root;
}

/** Rewrites one file under `root` (a path relative to it). */
export function edit(root: string, file: string, change: (text: string) => string): void {
  const full = path.join(root, file);
  writeFileSync(full, change(readFileSync(full, "utf8")));
}

/** fixtureRoot, as a git repo with everything committed, for `check --against`. */
export function fixtureRepo(name: string): string {
  const root = fixtureRoot(name);
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
      cwd: root,
      stdio: "ignore",
    });
  git("init", "-b", "main");
  git("add", ".");
  git("commit", "-m", "fixture");
  return root;
}
