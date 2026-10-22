// Skeleton: `pnpm sst:diff` and `pnpm sst:deploy` (`node scripts/sst.ts
// <diff|deploy> --stage <name>`): checks deploy/accounts.json for the stage
// first, so an empty file stops everything in a second with one line, then
// refuses a deploy while bootstrap step 6 has not replaced the skeleton
// (src/bootstrap-guard.ts), then builds the backend, lays out the function
// folders and runs SST. A script
// of its own, not a chain in package.json, because pnpm gives `--stage` to
// the last command of a chain only.
import { spawnSync } from "node:child_process";

import { bootstrapStateText, deployRefusal } from "../src/bootstrap-guard.ts";
import { stopWithoutAccounts } from "./args.ts";

const [command, ...args] = process.argv.slice(2);
if (command !== "diff" && command !== "deploy") {
  throw new Error("Usage: node scripts/sst.ts <diff|deploy> --stage <name>");
}
stopWithoutAccounts(args);
const refusal = deployRefusal(command, bootstrapStateText());
if (refusal !== undefined) {
  console.error(refusal);
  process.exit(1);
}

for (const [program, programArgs] of [
  ["turbo", ["run", "build", "--filter=@acme/backend"]],
  ["node", ["scripts/package.ts"]],
  ["sst", [command, ...args]],
] as const) {
  const step = spawnSync(program, programArgs, { stdio: "inherit" });
  if (step.status !== 0) process.exit(step.status ?? 1);
}
