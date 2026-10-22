// How the sweep runs git and bd: one injectable function, so tests pass a fake.
import { execFileSync } from "node:child_process";

export type Run = (
  cmd: string,
  args: string[],
  /** env adds to the process's; a key set to undefined is removed. */
  opts?: { cwd?: string; input?: string; env?: Record<string, string | undefined> },
) => string;

export const realRun: Run = (cmd, args, opts = {}) => {
  try {
    return execFileSync(cmd, args, {
      cwd: opts.cwd,
      input: opts.input,
      env: opts.env === undefined ? process.env : withEnv(opts.env),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    const detail = typeof stderr === "string" && stderr.trim() !== "" ? `: ${stderr.trim()}` : "";
    throw new Error(`${cmd} ${args.join(" ")} failed${detail}`, { cause: error });
  }
};

function withEnv(changes: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) Reflect.deleteProperty(env, key);
    else env[key] = value;
  }
  return env;
}
