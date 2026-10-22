import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { GitContext } from "./git.ts";
import type { Ports } from "./naming.ts";
import type { Launch, Signals } from "./processes.ts";
import type { PreviewState } from "./state.ts";

import { currentBranch, git, listWorktrees, mainRoot, toplevel } from "./git.ts";
import { allocatePorts, previewUrl, slugFromBranch, uniqueSlug } from "./naming.ts";
import { stopGroups, tail } from "./processes.ts";
import {
  clearState,
  ensurePreviewDir,
  logPath,
  markCreated,
  readLockHash,
  readState,
  wasCreatedByPreview,
  writeLockHash,
  writeState,
} from "./state.ts";
import { classify, resolveTarget } from "./targets.ts";
import { copyIncludes, ensureWorktree, lockHash, needsInstall } from "./worktrees.ts";

/** Branches from before DEV_API_PORT hard-code the dev API's port. */
export const LEGACY_API_PORT = 8787;

export interface Deps extends GitContext {
  isListening: (port: number) => Promise<boolean>;
  isPortFree: (port: number) => Promise<boolean>;
  launch: (launch: Launch) => number;
  now: () => Date;
  open: (url: string) => Promise<void>;
  out: (line: string) => void;
  signals: Signals;
  waitForHealth: (url: string) => Promise<boolean>;
  /** Runs fn while holding the repo-wide preview lock (lock.ts). */
  withLock: <T>(fn: () => Promise<T>) => Promise<T>;
}

/** A preview launched this recently may still be binding its ports. */
const STARTING_MS = 90_000;

interface Live {
  state: PreviewState;
  status: "running" | "starting";
  worktree: string;
}

const isFresh = (state: PreviewState, deps: Deps) =>
  deps.now().getTime() - Date.parse(state.startedAt) < STARTING_MS;

/**
 * running: the web group is alive and its port listens. starting: launched
 * moments ago, alive, not bound yet. Anything else is stale: a reboot can hand
 * the recorded PIDs to strangers.
 */
async function statusOf(state: PreviewState, deps: Deps): Promise<"stale" | Live["status"]> {
  if (!deps.signals.isAlive(state.pids.web)) return "stale";
  if (await deps.isListening(state.ports.web)) return "running";
  return isFresh(state, deps) ? "starting" : "stale";
}

/**
 * The groups that are provably still ours: alive, and either holding their own
 * port or launched moments ago. A stranger that inherited a PID does not hold
 * our port, so it is never signalled.
 */
async function ownGroups(state: PreviewState, deps: Deps): Promise<number[]> {
  const groups: [number | undefined, number][] = [
    [state.pids.api, state.ports.api],
    [state.pids.web, state.ports.web],
  ];
  const own: number[] = [];
  for (const [pid, port] of groups) {
    if (pid === undefined || !deps.signals.isAlive(pid)) continue;
    if (isFresh(state, deps) || (await deps.isListening(port))) own.push(pid);
  }
  return own;
}

/** Stops whatever of a preview is still ours, and forgets it. */
async function retire(worktree: string, state: PreviewState, deps: Deps): Promise<void> {
  await stopGroups(await ownGroups(state, deps), deps.signals);
  clearState(worktree);
}

/** Running and starting previews. Stale ones are retired on the way. */
async function livePreviews(deps: Deps): Promise<Live[]> {
  const found: Live[] = [];
  for (const tree of await listWorktrees(deps)) {
    const state = readState(tree.path);
    if (state === undefined) continue;
    const status = await statusOf(state, deps);
    if (status === "stale") await retire(tree.path, state, deps);
    else found.push({ state, status, worktree: tree.path });
  }
  return found;
}

async function printPreviewable(deps: Deps): Promise<void> {
  deps.out("Worktrees:");
  for (const tree of await listWorktrees(deps)) {
    deps.out(`  ${tree.branch ?? "(detached)"}  ${tree.path}`);
  }
}

function hasBackend(worktree: string): boolean {
  return existsSync(path.join(worktree, "backend", "package.json"));
}

function supportsDevApiPort(worktree: string): boolean {
  const server = path.join(worktree, "backend", "src", "entries", "dev", "server.ts");
  return existsSync(server) && readFileSync(server, "utf8").includes("loadDevConfig");
}

/** Ports other previews hold or have reserved while they start. */
function reservedPorts(others: Live[]): Set<number> {
  return new Set(others.flatMap(({ state }) => [state.ports.web, state.ports.api]));
}

async function portsFor(
  worktree: string,
  reserved: ReadonlySet<number>,
  deps: Deps,
): Promise<Ports | string> {
  const isFree = async (port: number) => !reserved.has(port) && (await deps.isPortFree(port));
  const ports = await allocatePorts(worktree, isFree);
  if (ports === undefined) {
    return "All 350 preview slots are busy. See pnpm preview list, then pnpm preview stop.";
  }
  if (!hasBackend(worktree) || supportsDevApiPort(worktree)) return ports;
  if (!(await isFree(LEGACY_API_PORT))) {
    return `This branch predates DEV_API_PORT, so its API needs port ${String(LEGACY_API_PORT)}, which is taken. Stop the other preview (or pnpm dev) first.`;
  }
  return { api: LEGACY_API_PORT, web: ports.web };
}

async function install(worktree: string, deps: Deps): Promise<boolean> {
  if (!needsInstall(worktree, readLockHash(worktree))) return true;
  deps.out("Installing dependencies…");
  const result = await deps.run("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], {
    cwd: worktree,
  });
  if (result.code !== 0) {
    deps.out(`${result.stdout}${result.stderr}`);
    return false;
  }
  writeLockHash(worktree, lockHash(worktree));
  return true;
}

function launchServers(
  worktree: string,
  ports: Ports,
  siteUrl: string,
  deps: Deps,
): PreviewState["pids"] {
  ensurePreviewDir(worktree);
  const env = { DEV_API_PORT: String(ports.api) };
  const api = hasBackend(worktree)
    ? deps.launch({
        args: ["--filter", "@acme/backend", "dev"],
        command: "pnpm",
        cwd: worktree,
        // The links in the dev server's emails open this preview.
        env: { ...env, DEV_SITE_URL: siteUrl },
        log: logPath(worktree, "api"),
      })
    : undefined;
  const web = deps.launch({
    args: ["exec", "next", "dev", "-p", String(ports.web), "-H", "127.0.0.1"],
    command: "pnpm",
    cwd: path.join(worktree, "frontend"),
    env,
    log: logPath(worktree, "web"),
  });
  return { api, web };
}

interface Launched {
  state: PreviewState;
  worktree: string;
}

type Resolved = Exclude<Awaited<ReturnType<typeof resolveTarget>>, { kind: "error" }>;

/**
 * Everything that decides ports and starts servers, run under the lock so two
 * `pnpm preview` runs never pick the same ports. Returns an exit code when
 * there is nothing to wait for.
 */
async function launch(
  input: string,
  resolved: Resolved,
  options: { open: boolean },
  deps: Deps,
): Promise<Launched | number> {
  const root = await mainRoot(deps);
  const tree =
    resolved.kind === "worktree"
      ? { created: false, path: resolved.path }
      : await ensureWorktree(resolved.branch, slugFromBranch(resolved.branch), deps);
  if (typeof tree === "string") {
    deps.out(tree);
    return 1;
  }
  if (tree.created) markCreated(tree.path);
  const branch =
    resolved.kind === "branch" ? resolved.branch : await currentBranch(deps, tree.path);
  const bead = resolved.kind === "branch" ? resolved.bead : undefined;

  const live = await livePreviews(deps);
  const existing = live.find((preview) => preview.worktree === tree.path);
  if (existing !== undefined) {
    const url = previewUrl(existing.state.slug, existing.state.ports);
    deps.out(`Already ${existing.status}: ${url}`);
    if (options.open) await deps.open(url);
    return 0;
  }
  const others = live.filter((preview) => preview.worktree !== tree.path);

  for (const file of await copyIncludes(root, tree.path, deps)) deps.out(`Copied ${file}`);
  if (!(await install(tree.path, deps))) return 1;

  const ports = await portsFor(tree.path, reservedPorts(others), deps);
  if (typeof ports === "string") {
    deps.out(ports);
    return 1;
  }
  const taken = new Set(others.map((preview) => preview.state.slug));
  const slug = uniqueSlug(
    slugFromBranch(branch ?? path.basename(tree.path)),
    branch ?? tree.path,
    taken,
  );

  const state: PreviewState = {
    bead,
    branch,
    pids: launchServers(tree.path, ports, previewUrl(slug, ports), deps),
    ports,
    slug,
    startedAt: deps.now().toISOString(),
    target: input,
    version: 1,
  };
  writeState(tree.path, state);
  deps.out(`Starting ${branch ?? tree.path} on ${previewUrl(slug, ports)} …`);
  return { state, worktree: tree.path };
}

export async function up(input: string, options: { open: boolean }, deps: Deps): Promise<number> {
  const resolved = await resolveTarget(input, deps);
  if (resolved.kind === "error") {
    deps.out(resolved.message);
    await printPreviewable(deps);
    return 1;
  }
  const launched = await deps.withLock(() => launch(input, resolved, options, deps));
  if (typeof launched === "number") return launched;

  const { state, worktree } = launched;
  const url = previewUrl(state.slug, state.ports);
  const health = hasBackend(worktree) ? "/api/health" : "/";
  if (!(await deps.waitForHealth(`http://127.0.0.1:${String(state.ports.web)}${health}`))) {
    const logs = `--- api.log ---\n${tail(logPath(worktree, "api"))}\n--- web.log ---\n${tail(logPath(worktree, "web"))}`;
    deps.out(`No answer within 60 s.\n${logs}`);
    await retire(worktree, state, deps);
    return 1;
  }
  deps.out(`Ready: ${url}\nWorktree: ${worktree}\nStop it with: pnpm preview stop ${state.slug}`);
  if (options.open) await deps.open(url);
  return 0;
}

export async function list(deps: Deps): Promise<number> {
  const previews = await livePreviews(deps);
  if (previews.length === 0) {
    deps.out("No previews running.");
    return 0;
  }
  const now = deps.now().getTime();
  for (const { state, status, worktree } of previews) {
    const minutes = Math.round((now - Date.parse(state.startedAt)) / 60_000);
    deps.out(
      `${state.slug}  ${state.branch ?? "(detached)"}  ${previewUrl(state.slug, state.ports)}  ${status}  ${worktree}  ${String(minutes)} min`,
    );
  }
  return 0;
}

export async function removalRefusal(worktree: string, deps: Deps): Promise<string | undefined> {
  if (!wasCreatedByPreview(worktree)) return "preview did not create this worktree";
  if ((await git(deps, ["status", "--porcelain"], worktree)) !== "") {
    return "it has uncommitted changes";
  }
  const unpushed = await git(deps, ["rev-list", "--count", "HEAD", "--not", "--remotes"], worktree);
  if (unpushed !== "0") return `it has ${unpushed} commit(s) on no remote`;
  return undefined;
}

async function worktreesToStop(
  input: string | undefined,
  all: boolean,
  deps: Deps,
): Promise<string[] | string> {
  const previews = await livePreviews(deps);
  if (all) return previews.map((preview) => preview.worktree);
  if (input === undefined) return "stop needs a target, or --all";
  // "." is this worktree; every `pnpm preview .` records target ".".
  if (classify(input).kind === "current") return [await toplevel(deps)];
  const matches = previews.filter(({ state }) =>
    [state.slug, state.branch, state.bead, state.target].includes(input),
  );
  if (matches.length > 0) return matches.map((preview) => preview.worktree);
  const resolved = await resolveTarget(input, deps);
  if (resolved.kind === "error") return resolved.message;
  if (resolved.kind === "worktree") return [resolved.path];
  const tree = (await listWorktrees(deps)).find((t) => t.branch === resolved.branch);
  return tree === undefined ? `No worktree has ${resolved.branch}.` : [tree.path];
}

export async function stop(
  input: string | undefined,
  options: { all: boolean; remove: boolean },
  deps: Deps,
): Promise<number> {
  const targets = await worktreesToStop(input, options.all, deps);
  if (typeof targets === "string") {
    deps.out(targets);
    return 1;
  }
  if (targets.length === 0) deps.out("No previews running.");
  const root = await mainRoot(deps);
  let code = 0;
  for (const worktree of targets) {
    const state = readState(worktree);
    if (state !== undefined) {
      await retire(worktree, state, deps);
      deps.out(`Stopped ${state.slug}`);
    }
    if (!options.remove) continue;
    const refusal = await removalRefusal(worktree, deps);
    if (refusal === undefined) {
      // Our own checks passed; --force only covers ignored files (node_modules, .preview).
      await git(deps, ["worktree", "remove", "--force", worktree], root);
      deps.out(`Removed ${worktree}`);
    } else {
      deps.out(`Kept ${worktree}: ${refusal}`);
      code = 1;
    }
  }
  return code;
}
