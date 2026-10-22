// PostToolUse hook: when a session claims a bead, record
// the session's branch on it; when it opens a PR, record the PR on the bead
// whose branch it is. `pnpm preview <bead-id>` reads both. It never blocks
// and never prints: a failure here must not disturb the session.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface HookInput {
  cwd?: string;
  tool_input?: { command?: unknown };
  tool_name?: string;
  tool_response?: { stdout?: unknown };
}

type Exec = (command: string, args: string[], cwd: string) => string;

function claims(flags: string[]): boolean {
  return flags.some(
    (flag, index) =>
      flag === "--claim" ||
      flag === "--status=in_progress" ||
      ((flag === "--status" || flag === "-s") && flags[index + 1] === "in_progress"),
  );
}

/** The bead ids a command claims, per `&&`/`;`/`|` segment. */
export function claimedBeads(command: string): string[] {
  return command.split(/&&|\|\||[;|\n]/).flatMap((segment) => {
    const tokens = segment.trim().split(/\s+/);
    const at = tokens.findIndex((token, index) => token === "bd" && tokens[index + 1] === "update");
    if (at === -1) return [];
    const rest = tokens.slice(at + 2);
    const firstFlag = rest.findIndex((token) => token.startsWith("-"));
    const ids = firstFlag === -1 ? rest : rest.slice(0, firstFlag);
    const flags = firstFlag === -1 ? [] : rest.slice(firstFlag);
    return claims(flags) ? ids : [];
  });
}

export function createdPr(command: string, stdout: string): number | undefined {
  if (!/\bgh\s+pr\s+create\b/.test(command)) return undefined;
  const number = /\/pull\/(\d+)\b/.exec(stdout)?.[1];
  return number === undefined ? undefined : Number(number);
}

export function record(input: HookInput, exec: Exec): string[] {
  const command = input.tool_input?.command;
  const cwd = input.cwd;
  if (input.tool_name !== "Bash" || typeof command !== "string" || cwd === undefined) return [];
  const branch = () => exec("git", ["branch", "--show-current"], cwd).trim();
  const actions: string[] = [];

  const ids = claimedBeads(command);
  const current = ids.length > 0 ? branch() : "";
  if (current !== "" && current !== "main") {
    for (const id of ids) {
      exec("bd", ["update", id, "--set-metadata", `branch=${current}`], cwd);
      actions.push(`${id} branch=${current}`);
    }
  }

  const stdout = typeof input.tool_response?.stdout === "string" ? input.tool_response.stdout : "";
  const pr = createdPr(command, stdout);
  if (pr !== undefined) {
    const listed = exec(
      "bd",
      ["list", "--metadata-field", `branch=${branch()}`, "--all", "--json"],
      cwd,
    );
    const beads = JSON.parse(listed || "[]") as { id: string }[];
    const [bead] = beads;
    if (beads.length === 1 && bead !== undefined) {
      exec("bd", ["update", bead.id, "--external-ref", `gh-${String(pr)}`], cwd);
      actions.push(`${bead.id} external-ref=gh-${String(pr)}`);
    }
  }
  return actions;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    record(JSON.parse(readFileSync(0, "utf8")) as HookInput, (command, args, cwd) =>
      execFileSync(command, args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 8000,
      }),
    );
  } catch {
    // Recording is best-effort; the session must never notice a failure here.
  }
}
