// `pnpm diff-guard --stage <name> [--first-deploy] <file>`: reads a saved
// `sst diff` and exits 1 if the deploy would delete, replace or (on a stage
// that keeps data, after its first deploy) create a resource that holds data.
// In GitHub Actions it also writes the plan's
// change lines to the job summary.
import { appendFileSync, readFileSync } from "node:fs";

import { changeLines, diffProblems } from "../src/diff-guard.ts";
import { stageSettings } from "../src/stage.ts";
import { stageArgument } from "./args.ts";

const stage = stageArgument(process.argv);
const file = process.argv
  .slice(2)
  .find((arg, i, args) => !arg.startsWith("--") && args[i - 1] !== "--stage");
if (file === undefined)
  throw new Error("Name the saved diff: pnpm diff-guard --stage <name> [--first-deploy] <file>");

const output = readFileSync(file, "utf8");
const problems = diffProblems(output, stage, {
  keepsData: stageSettings(stage).protect,
  firstDeploy: process.argv.includes("--first-deploy"),
});
const changes = changeLines(output);

const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) {
  appendFileSync(
    summary,
    [
      `### sst diff, stage \`${stage}\``,
      "",
      "```",
      ...(changes.length > 0 ? changes : ["(no changes)"]),
      "```",
      "",
      problems.length > 0 ? "**Refused:**\n" : "Diff guard passed.",
      ...problems.map((problem) => "- " + problem),
      "",
    ].join("\n"),
  );
}

console.log(`${String(changes.length)} change lines read for stage "${stage}".`);
if (problems.length > 0) {
  for (const problem of problems) console.log(problem);
  console.log(
    "Diff guard refused the deploy; nothing was deployed. Read the diff and the runbook " +
      "(docs/runbooks/deployment.md, Deploy a stage).",
  );
  process.exit(1);
}
console.log("Diff guard passed: nothing that holds data is deleted or replaced.");
