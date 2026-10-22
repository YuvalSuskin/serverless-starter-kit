// pnpm preview doctor: what this machine needs, and the fix
// for each gap. No version manager: .nvmrc and packageManager are the pins.
import { readFileSync } from "node:fs";
import path from "node:path";

import type { GitContext } from "./git.ts";

import { mainRoot } from "./git.ts";

interface Check {
  fix: string;
  name: string;
  ok: boolean;
  required: boolean;
}

export function atLeast(version: string, floor: string): boolean {
  const parts = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const [a, b] = [parts(version), parts(floor)];
  for (let index = 0; index < 3; index++) {
    const [x = 0, y = 0] = [a[index], b[index]];
    if (x !== y) return x > y;
  }
  return true;
}

/** The first "x.y.z" word in a tool's --version output ("v24.21.0", "git version 2.39.5 (Apple…)"). */
function firstVersion(text: string): string {
  const isVersion = (word: string) => {
    const parts = word.split(".");
    return parts.length >= 3 && parts.slice(0, 3).every((part) => /^\d+$/.test(part));
  };
  const word = text
    .split(/\s+/)
    .map((token) => (token.startsWith("v") ? token.slice(1) : token))
    .find(isVersion);
  return word ?? "0.0.0";
}

export async function doctor(deps: GitContext & { out: (line: string) => void }): Promise<number> {
  const root = await mainRoot(deps);
  const node = readFileSync(path.join(root, ".nvmrc"), "utf8").trim();
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    packageManager?: string;
  };
  const pnpm = manifest.packageManager?.split("@")[1] ?? "";
  const probe = async (command: string, args: string[]) => deps.run(command, args, { cwd: root });

  const nodeVersion = await probe("node", ["--version"]);
  const pnpmVersion = await probe("pnpm", ["--version"]);
  const gitVersion = await probe("git", ["--version"]);
  const ghAuth = await probe("gh", ["auth", "status"]);
  const checks: Check[] = [
    {
      fix: `Install Node ${node} or newer (nvm install ${node}).`,
      name: `Node >= ${node}`,
      ok: nodeVersion.code === 0 && atLeast(firstVersion(nodeVersion.stdout), node),
      required: true,
    },
    {
      fix: `corepack enable, then run pnpm again (it pins pnpm ${pnpm}).`,
      name: `pnpm ${pnpm}`,
      ok: pnpmVersion.code === 0 && pnpmVersion.stdout.trim() === pnpm,
      required: true,
    },
    {
      // The newest git feature preview uses: rev-parse --path-format (2.31).
      fix: "Install git 2.31 or newer (brew install git).",
      name: "git >= 2.31",
      ok: gitVersion.code === 0 && atLeast(firstVersion(gitVersion.stdout), "2.31.0"),
      required: true,
    },
    {
      fix: "brew install gh, then gh auth login (PR targets, and agents opening PRs).",
      name: "gh, signed in",
      ok: ghAuth.code === 0,
      required: false,
    },
    {
      fix: "brew install beads (bead targets and task tracking).",
      name: "bd",
      ok: (await probe("bd", ["--version"])).code === 0,
      required: false,
    },
    {
      fix: "Start Docker Desktop (pnpm check's contract tests need it; preview does not).",
      name: "Docker",
      ok: (await probe("docker", ["info", "--format", "{{.ServerVersion}}"])).code === 0,
      required: false,
    },
    {
      fix: "npm install -g typescript-language-server typescript (the TypeScript LSP plugin).",
      name: "typescript-language-server",
      ok: (await probe("typescript-language-server", ["--version"])).code === 0,
      required: false,
    },
    {
      fix: "Install Python 3 (only for rebuilding design/).",
      name: "Python 3",
      ok: (await probe("python3", ["--version"])).code === 0,
      required: false,
    },
  ];
  for (const check of checks) {
    deps.out(check.ok ? `✓ ${check.name}` : `✗ ${check.name}: ${check.fix}`);
  }
  return checks.some((check) => check.required && !check.ok) ? 1 : 0;
}
