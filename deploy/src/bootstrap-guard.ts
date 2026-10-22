// Until bootstrap step 6 replaces the skeleton, nothing is deployed: the
// skeleton's demo routes are unauthenticated (GET lists every message anyone
// sent, POST takes messages unpaced). The state is the bootstrap's own,
// `.bootstrap/state.json` at the repo root (`.claude/skills/bootstrap/`). The
// template ships it with every step pending, and the bootstrap's Finishing
// keeps it, so a missing file means a project deleted `.bootstrap/` after the
// bootstrap: nothing is refused (TB111, TB131).
// `sst diff` changes nothing, so it always runs.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STATE_FILE = fileURLToPath(new URL("../../.bootstrap/state.json", import.meta.url));
const STEP = "6-replace-skeleton";

/**
 * The bootstrap's state file as text, or undefined when there is none.
 * `ACME_BOOTSTRAP_STATE_FILE` points at another file; the tests use it.
 */
export function bootstrapStateText(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const file = env.ACME_BOOTSTRAP_STATE_FILE ?? STATE_FILE;
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

/** Why a deploy must stop, in one line; undefined when it may go on. */
export function deployRefusal(
  command: "deploy" | "diff",
  stateText: string | undefined,
): string | undefined {
  if (command === "diff" || stateText === undefined) return undefined;
  let status: unknown;
  try {
    const state = JSON.parse(stateText) as unknown;
    if (typeof state !== "object" || state === null || Array.isArray(state)) throw new Error();
    status = (state as { steps?: Record<string, { status?: unknown } | undefined> }).steps?.[STEP]
      ?.status;
  } catch {
    return ".bootstrap/state.json is not a bootstrap state: no deploy until it is fixed (pnpm bootstrap:state says why).";
  }
  if (status === "done") return undefined;
  return "The template's skeleton is still in place, and its demo routes are unauthenticated: nothing is deployed until /bootstrap replace-skeleton (step 6) replaces it. pnpm sst:diff still runs.";
}
