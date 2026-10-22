// Test helpers: real git in a temporary repo (with a bare "origin"), and a
// runner that answers chosen commands (gh, bd, pnpm) from a script.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Runner, RunResult } from "./run.ts";

import { run } from "./run.ts";

interface TempRepo {
  /** Commits a file on the current branch. */
  commit: (file: string, content: string, message: string) => void;
  /** Runs git in the repo (or in `cwd`) and returns trimmed stdout. */
  git: (args: string[], cwd?: string) => string;
  root: string;
}

export function tempRepo(): TempRepo {
  // realpath: macOS's tmpdir is a symlink, and git reports real paths.
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), "preview-test-")));
  const root = path.join(base, "repo");
  const origin = path.join(base, "origin.git");
  mkdirSync(root);
  const gitIn = (args: string[], cwd = root) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
      cwd,
      encoding: "utf8",
    }).trim();
  execFileSync("git", ["init", "--bare", "-b", "main", origin]);
  gitIn(["init", "-b", "main"]);
  gitIn(["remote", "add", "origin", origin]);
  const commit = (file: string, content: string, message: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
    gitIn(["add", file]);
    gitIn(["commit", "-m", message]);
  };
  commit("README.md", "test\n", "initial");
  gitIn(["push", "-u", "origin", "main"]);
  return { commit, git: gitIn, root };
}

/** Scripted answers keyed by "command arg arg"; unscripted git runs for real, anything else is "not installed" (127). */
export function scriptedRunner(
  answers: Record<string, Partial<RunResult>>,
): Runner & { calls: string[] } {
  const calls: string[] = [];
  const runner: Runner = async (command, args, options) => {
    const key = [command, ...args].join(" ");
    calls.push(key);
    const answer = answers[key];
    if (answer !== undefined) return { code: 0, stderr: "", stdout: "", ...answer };
    // Only git runs for real; any other program must be scripted, so no test
    // depends on what this machine happens to have installed.
    if (command !== "git") return { code: 127, stderr: `unscripted: ${key}`, stdout: "" };
    return run(command, args, options);
  };
  return Object.assign(runner, { calls });
}
