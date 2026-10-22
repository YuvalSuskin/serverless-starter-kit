// pnpm review-batch build <cards.json> --out <page.html>
import { readFileSync, writeFileSync } from "node:fs";

import { buildPage } from "./build.ts";
import { BatchSchema } from "./cards.ts";

const USAGE = "Usage: pnpm review-batch build <cards.json> --out <page.html>";

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

const [command, file, ...rest] = process.argv.slice(2);
const out = rest[rest.indexOf("--out") + 1];
if (command !== "build" || file === undefined || !rest.includes("--out") || out === undefined)
  fail(USAGE, 2);

const parsed = BatchSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
if (!parsed.success) {
  fail(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
}

writeFileSync(out, buildPage(parsed.data));
process.stdout.write(`Wrote ${out} (${String(parsed.data.cards.length)} cards)\n`);
