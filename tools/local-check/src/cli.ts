// pnpm check:push / pnpm check:full: every check, on this machine, and the
// proof main's branch rule requires (CI decisions CI1, CI9-CI12, CI17 in
// docs/decisions/2026-10-06-ci-decisions.md).
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, openSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { proofScope } from "./e2e-matrix.ts";
import { realRun, realStream } from "./exec.ts";
import { checkFull, type Deps, postWhenPushed, prePush } from "./flows.ts";
import { mergeGate } from "./merge-gate.ts";
import { majorOf } from "./node-pin.ts";
import { realOfflineOptions, runOffline } from "./offline.ts";
import { releaseCheck } from "./release.ts";

const USAGE = `Usage:
  pnpm check:push              the pre-push hook's check (git push runs it)
  pnpm check:full [--ready]    every check, then the proof on GitHub;
                               --ready then marks the branch's draft PR ready
  pnpm merge-gate <pr>         whether a ready PR may be merged now, and the
                               command to merge it (never merges itself)
  pnpm offline [--budget <ms>] pnpm dev with the network blocked, within the start
                               budget, then the skeleton e2e spec against it
  node tools/local-check/src/cli.ts post --sha <sha> [--wait <seconds>]
  node tools/local-check/src/cli.ts proof-scope  ci.yml's proof job, on a pull request
  node tools/local-check/src/cli.ts release-check  deploy-production.yml's check of the commit it releases`;

const ROOT = path.join(import.meta.dirname, "../../..");

/** .nvmrc: the Node pin, and the file ci.yml's setup-node reads (CI16). */
function pinnedNode(): string | undefined {
  try {
    return readFileSync(path.join(ROOT, ".nvmrc"), "utf8").trim();
  } catch {
    return undefined;
  }
}

function postLater(sha: string): void {
  const dir = path.resolve(
    ROOT,
    realRun("git", ["rev-parse", "--git-common-dir"], { cwd: ROOT }).trim(),
    "acme",
  );
  mkdirSync(dir, { recursive: true });
  const log = openSync(path.join(dir, "post.log"), "a");
  spawn(process.execPath, [import.meta.filename, "post", "--sha", sha, "--wait", "600"], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", log, log],
  }).unref();
  process.stdout.write(
    `local-check: ${sha.slice(0, 10)} passed pnpm check:full; its proof is posted once the push lands.\n`,
  );
}

const deps: Deps = {
  run: realRun,
  stream: realStream,
  root: ROOT,
  host: { platform: process.platform, release: os.release() },
  env: process.env,
  node: { version: process.version, pinned: pinnedNode() },
  log: (line) => {
    process.stdout.write(`${line}\n`);
  },
  now: () => Date.now(),
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
  postLater,
};

function value(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

// The local-first rule's proof (root CLAUDE.md): also a step of check:full.
// --budget <ms> is for diagnosing a loaded machine; check:full never passes it.
async function offline(budget: number): Promise<number> {
  const result = await runOffline({
    ...realOfflineOptions(ROOT),
    ...(Number.isFinite(budget) && budget > 0 ? { budgetMs: budget } : {}),
  });
  for (const problem of result.problems) deps.log(`offline: ${problem}`);
  deps.log(
    result.ok
      ? `offline: ok (pnpm dev started in ${String(result.startMs)} ms, budget ${String(result.budgetMs)} ms; starts: ${result.startsMs.map(String).join(", ")} ms)`
      : "offline: failed",
  );
  return result.ok ? 0 : 1;
}

async function main(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  switch (command) {
    case "push": {
      return prePush(deps);
    }
    case "full": {
      return checkFull(deps, { ready: rest.includes("--ready") });
    }
    case "offline": {
      return offline(Number(value(rest, "--budget")));
    }
    case "post": {
      const sha = value(rest, "--sha");
      if (sha === undefined) break;
      return postWhenPushed(deps, sha, Number(value(rest, "--wait") ?? "0"));
    }
    case "merge-gate": {
      // CI18: the orchestrator's merge gate. It says; it never merges.
      const number = Number(rest[0]);
      if (!Number.isInteger(number) || number <= 0) break;
      // A kill outside a streamed suite (the lock's wait, a git step) exits
      // too, so the `exit` handler removes the worktree. While a suite runs,
      // realStream's own handler kills its process group, then exits.
      for (const [signal, code] of [
        ["SIGINT", 130],
        ["SIGTERM", 143],
      ] as const) {
        process.on(signal, () => {
          if (process.listenerCount(signal) === 1) process.exit(code);
        });
      }
      return mergeGate(
        {
          ...deps,
          removeDir: (dir) => {
            rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
          },
          atExit: (fn) => {
            process.once("exit", fn);
          },
        },
        number,
      );
    }
    case "proof-scope": {
      // ci.yml's proof job (CI decisions CI17): whether the proof on the head
      // covers the change. Fails the job when it does not, or cannot tell.
      const { PROOF_DESCRIPTION, FRONTEND_AFFECTED } = process.env;
      const result = proofScope({
        description: PROOF_DESCRIPTION,
        frontendAffected: FRONTEND_AFFECTED,
        ciNode: majorOf(pinnedNode()),
      });
      if (result.ok) {
        process.stdout.write(`The proof covers this change: ${result.reason}.\n`);
        return 0;
      }
      process.stdout.write(
        `::error::The proof does not cover this change: ${result.reason}. Run pnpm check:full ` +
          "on this commit, on the repo's Node (.nvmrc) and a machine that runs WebKit " +
          "(tools/local-check/CLAUDE.md).\n",
      );
      return 1;
    }
    case "release-check": {
      // deploy-production.yml (CI decisions CI19): the commit it releases is
      // on main's history and proven, and an apply follows its plan.
      return releaseCheck({
        run: realRun,
        cwd: process.cwd(),
        env: process.env,
        log: deps.log,
        append: (file, text) => {
          appendFileSync(file, text);
        },
      });
    }
    default: {
      break;
    }
  }
  process.stderr.write(`${USAGE}\n`);
  return 2;
}

process.exitCode = await main(process.argv.slice(2));
