// pnpm bootstrap:state: where `/bootstrap` stands, read from and written to
// `.bootstrap/state.json` (src/bootstrap-state.ts).
//
//   pnpm bootstrap:state                 every step's status, then `next: <step>` (or `next: none`)
//   pnpm bootstrap:state done <step>     records a step as done today
//   pnpm bootstrap:state defer accounts  records step 7 as deferred today
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  type BootstrapState,
  InvalidState,
  markStep,
  nextStep,
  parseState,
  stepByName,
  STEPS,
} from "./bootstrap-state.ts";

const USAGE = "Usage: pnpm bootstrap:state [done <step> | defer accounts]";

/** Thrown with the message to print and the exit code. */
class Stop extends Error {
  readonly code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

function readState(file: string): BootstrapState {
  try {
    return parseState(
      existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as unknown) : undefined,
    );
  } catch (error) {
    if (!(error instanceof InvalidState || error instanceof SyntaxError)) throw error;
    throw new Stop(`.bootstrap/state.json is not a bootstrap state: ${error.message}`, 1);
  }
}

/** The state with `done <step>` or `defer <step>` recorded today. */
function record(state: BootstrapState, verb: "done" | "defer", name: string): BootstrapState {
  const step = stepByName(name);
  if (step === undefined) throw new Stop(`No step "${name}". The steps: ${STEPS.join(", ")}.`, 2);
  try {
    const today = new Date().toISOString().slice(0, 10);
    return markStep(state, step, verb === "done" ? "done" : "deferred", today);
  } catch (error) {
    if (!(error instanceof InvalidState)) throw error;
    throw new Stop(error.message, 2);
  }
}

function main(argv: string[]): number {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const file = path.join(root, ".bootstrap/state.json");
  const [verb, name = ""] = argv;
  let state = readState(file);
  if (verb === "done" || verb === "defer") {
    state = record(state, verb, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  } else if (verb !== undefined) {
    throw new Stop(USAGE, 2);
  }
  for (const step of STEPS) {
    const entry = state.steps[step];
    const status = entry ? [entry.status, entry.date ?? ""].join(" ") : "-";
    console.log(`${step.padEnd(20)} ${status}`);
  }
  console.log(`next: ${nextStep(state) ?? "none"}`);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof Stop)) throw error;
  console.error(error.message);
  process.exitCode = error.code;
}
