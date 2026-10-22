// check:full's rename-copy step (design §5, TB93): renames a copy of HEAD the
// way a new project is named, then runs `pnpm check` there and confirms no
// placeholder is left outside the allowlist. A copy from `git archive` holds
// only what is committed, with no worktree, tracker or node_modules of ours.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { leftovers, MARKER } from "./rename.ts";

const SLUG = "demo";
const DISPLAY = "Demo";

// bd init commits in the copy; the copy's commits need an author. And bd must
// find the copy's tracker, never one an inherited variable points at.
const env: NodeJS.ProcessEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== "BEADS_DIR" && key !== "BEADS_DB"),
  ),
  GIT_AUTHOR_EMAIL: "rename-copy@example.invalid",
  GIT_AUTHOR_NAME: "rename-copy",
  GIT_COMMITTER_EMAIL: "rename-copy@example.invalid",
  GIT_COMMITTER_NAME: "rename-copy",
};

// The child running now, so a signal reaches it and the copy is cleaned up
// after it stops (a synchronous spawn would leave no moment to clean up).
let current: ChildProcess | undefined;
let stopped: NodeJS.Signals | undefined;

function step(what: string, cmd: string, args: string[], cwd: string): Promise<void> {
  if (stopped !== undefined) return Promise.reject(new Error(`stopped by ${stopped}`));
  console.log(`rename-copy: ${what}`);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: "inherit" });
    current = child;
    child.on("error", reject);
    child.on("close", (code, signal) => {
      current = undefined;
      if (code === 0) resolve();
      else reject(new Error(`${[cmd, ...args].join(" ")} failed (exit ${String(code ?? signal)})`));
    });
  });
}

async function main(): Promise<number> {
  const root = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).stdout.trim();
  // A named project has no marker: nothing to rename, until the bootstrap
  // deletes this step with the rename.
  if (spawnSync("git", ["cat-file", "-e", `HEAD:${MARKER}`], { cwd: root }).status !== 0) {
    console.log(`rename-copy: skipped, HEAD has no ${MARKER} (this project is already named)`);
    return 0;
  }
  const copy = mkdtempSync(path.join(tmpdir(), "rename-copy-"));
  let started = false;
  const cleanUp = () => {
    // Only the turbo daemon this run may have started, for the copy's own repo.
    if (started && existsSync(path.join(copy, "node_modules/.bin/turbo"))) {
      spawnSync("pnpm", ["exec", "turbo", "daemon", "stop"], { cwd: copy, env, stdio: "ignore" });
    }
    rmSync(copy, { force: true, recursive: true });
  };
  const onSignal = (signal: NodeJS.Signals) => {
    stopped = signal;
    current?.kill(signal);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    const tar = path.join(copy, ".head.tar");
    await step("copying HEAD", "git", ["archive", "--format=tar", "-o", tar, "HEAD"], root);
    await step("unpacking", "tar", ["-xf", tar, "-C", copy], copy);
    rmSync(tar);
    await step(
      "committing the copy",
      "sh",
      ["-c", "git init -q -b main && git add -A && git commit -q -m template"],
      copy,
    );
    started = true;
    await step(
      `pnpm rename ${SLUG} "${DISPLAY}"`,
      "node",
      ["tools/bootstrap/src/cli.ts", SLUG, DISPLAY],
      copy,
    );
    await step("pnpm check in the copy", "pnpm", ["check", "--concurrency=2"], copy);

    const left = leftovers(copy, { installed: true });
    if (left.length > 0) {
      console.error("rename-copy: the placeholder is left outside the allowlist:");
      for (const hit of left) console.error(`  ${hit.file}:${String(hit.line)}: ${hit.text}`);
      return 1;
    }
    console.log(
      "rename-copy: passed (the renamed copy is green and names no placeholder outside the allowlist)",
    );
    return 0;
  } catch (error) {
    console.error(`rename-copy: ${(error as Error).message}`);
    return 1;
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    cleanUp();
  }
}

void main().then((code) => {
  // Stopped by a signal: exit as if it had ended us (128 plus its number), now the copy is gone.
  const signalCode = stopped === "SIGINT" ? 130 : 143;
  process.exitCode = stopped === undefined ? code : signalCode;
});
