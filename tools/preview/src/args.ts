import { parseArgs } from "node:util";

type Command =
  | { all: boolean; kind: "stop"; remove: boolean; target: string | undefined }
  | { kind: "doctor" }
  | { kind: "help"; message?: string }
  | { kind: "list" }
  | { kind: "up"; open: boolean; target: string };

export const USAGE = `pnpm preview <target> [--no-open]   run a branch on its own URL
pnpm preview list                   what is running
pnpm preview stop <target> [--remove] | stop --all
pnpm preview doctor                 check this machine

<target>: a branch, a PR ('#12', quoted: an unquoted # starts a shell comment) or PR URL,
a bead id, part of a worktree's name, or "." (this worktree)`;

export function parseCli(argv: readonly string[]): Command {
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      args,
      options: {
        all: { default: false, type: "boolean" },
        help: { default: false, short: "h", type: "boolean" },
        "no-open": { default: false, type: "boolean" },
        remove: { default: false, type: "boolean" },
      },
    });
  } catch (error) {
    return { kind: "help", message: (error as Error).message };
  }
  const { positionals, values } = parsed;
  const [first, second] = positionals;
  if (values.help || first === undefined) return { kind: "help" };
  if (first === "list") return { kind: "list" };
  if (first === "doctor") return { kind: "doctor" };
  if (first === "stop") {
    if (!values.all && second === undefined) {
      return { kind: "help", message: "stop needs a target, or --all" };
    }
    return { all: values.all, kind: "stop", remove: values.remove, target: second };
  }
  return { kind: "up", open: !values["no-open"], target: first };
}
