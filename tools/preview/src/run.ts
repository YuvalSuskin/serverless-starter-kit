import type { ExecFileException } from "node:child_process";

import { execFile } from "node:child_process";

export interface RunResult {
  code: number;
  stderr: string;
  stdout: string;
}

interface RunOptions {
  cwd?: string;
}

/** Runs a program without a shell, so paths with spaces are safe. */
export type Runner = (
  command: string,
  args: readonly string[],
  options?: RunOptions,
) => Promise<RunResult>;

function exitCode(error: ExecFileException): number {
  if (typeof error.code === "number") return error.code;
  // The program is not installed.
  if (error.code === "ENOENT") return 127;
  return 1;
}

export const run: Runner = (command, args, options = {}) =>
  new Promise((resolve) => {
    execFile(
      command,
      [...args],
      { cwd: options.cwd, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ code: 0, stderr, stdout });
          return;
        }
        resolve({ code: exitCode(error), stderr: stderr || error.message, stdout });
      },
    );
  });
