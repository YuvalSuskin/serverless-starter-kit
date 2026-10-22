// pnpm rename <slug> "<Display Name>": names a fresh clone of the template,
// then gives it its own tracker (src/finish.ts). `pnpm rename --resume` runs
// the steps after the rename again, once a failed one is fixed. It never
// prompts; it prints what it did.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { finishSteps, renamedSlug, type Runner, runSteps } from "./finish.ts";
import { MARKER, renameProject, RenameRefused, type RenameReport } from "./rename.ts";
import { existingTracker, setAsideTracker } from "./tracker.ts";

const USAGE = [
  'Usage: pnpm rename <slug> "<Display Name>"   (for example: pnpm rename my-shop "My Shop")',
  "       pnpm rename --resume                   (after a failed step: runs the steps after the rename again)",
].join("\n");

// bd must find this repo's tracker, never one an inherited variable points at.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key !== "BEADS_DIR" && key !== "BEADS_DB"),
);

const runner =
  (root: string): Runner =>
  (cmd, args) =>
    spawnSync(cmd, args, { cwd: root, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });

function summary(report: RenameReport): string {
  const counts = Object.entries(report.replacements)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${kind} ${String(n)}`)
    .join(", ");
  const lines = [
    `Rewrote ${String(report.filesChanged)} files: ${counts}.`,
    ...report.renamedPaths.map(({ from, to }) => `  renamed ${from} -> ${to}`),
  ];
  if (report.trackerRemote !== undefined) {
    lines.push(
      `Removed the template's tracker remote from .beads/config.yaml (${report.trackerRemote}): bd init starts a fresh tracker. The project's own remote is the owner's call (bootstrap step 1 or 3).`,
    );
  }
  if (report.thirdParty.length > 0) {
    lines.push(`Left third-party names as they are: ${report.thirdParty.join(", ")}.`);
  }
  return lines.join("\n");
}

function finish(root: string, slug: string): number {
  const { ok, report } = runSteps(finishSteps(root, slug, runner(root)), (line) => {
    console.log(line);
  });
  if (!ok) {
    console.error(report);
    return 1;
  }
  console.log(
    "Done. Review the changes with git status: files are modified, renamed and deleted, and new untracked ones (a renamed path) need git add. Then commit them as one change. Nothing was pushed.",
  );
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  if (argv.length === 1 && argv[0] === "--resume") {
    const slug = renamedSlug(root);
    if (existsSync(path.join(root, MARKER)) || slug === undefined) {
      console.error(`Nothing to resume: this repo is not renamed yet.\n${USAGE}`);
      return 1;
    }
    return finish(root, slug);
  }
  if (argv.length !== 2) {
    console.error(USAGE);
    return 2;
  }
  const [slug = "", display = ""] = argv;

  // Checked before any file changes.
  if (spawnSync("bd", ["--version"], { env }).status !== 0) {
    console.error("bd is not on PATH: install beads first (https://github.com/gastownhall/beads).");
    return 1;
  }
  const tracker = existingTracker(root, runner(root));
  if (tracker.kind === "used") {
    console.error(
      `This checkout already holds a tracker database (.beads/${tracker.dirs.join(", .beads/")}), and ${tracker.why}: it is the template's own, or one left by an earlier try. Rename a fresh clone, or remove it (rm -rf .beads/embeddeddolt) after restoring the template.`,
    );
    return 1;
  }

  const report = await renameProject(root, { display, slug });
  console.log(summary(report));
  if (tracker.kind === "empty") {
    // Left by bd prime (Claude Code's SessionStart hook) or another bd command: nothing in it.
    const moved = setAsideTracker(root, tracker.dirs);
    console.log(
      `Set aside an empty tracker database bd had created (${moved.join(", ")}); delete it when you like.`,
    );
  }
  return finish(root, slug);
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    if (error instanceof RenameRefused) {
      console.error(`pnpm rename refused: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  },
);
