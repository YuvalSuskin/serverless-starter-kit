// The suites again, on the adapters as esbuild bundles them for the Lambda
// (scripts/lambda-build.ts). Bundling can break an SDK where the source works
// -- a CommonJS/ES module mix-up, a dropped side effect -- and the bundle
// smoke test never reaches DynamoDB.
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll } from "vitest";

import type * as Adapters from "./bundled-adapters";

import { lambdaBuildOptions } from "../../scripts/lambda-build";
import { mailerOnStandIn, messageStoreOnEmulator } from "./on-emulators";

// Inside backend/, so the bundle's imports resolve from backend/node_modules
// as they will beside the Lambda's.
const scratch = path.join(import.meta.dirname, "../../dist/bundled-tests");
mkdirSync(scratch, { recursive: true });
const outdir = mkdtempSync(path.join(scratch, "adapters-"));
afterAll(() => {
  rmSync(outdir, { force: true, recursive: true });
});

await build({
  ...lambdaBuildOptions,
  entryPoints: { adapters: path.join(import.meta.dirname, "bundled-adapters.ts") },
  outdir,
});
const bundled = (await import(
  pathToFileURL(path.join(outdir, "adapters.mjs")).href
)) as typeof Adapters;

// Skeleton: the demo store's suite; bootstrap step 6 runs the first store's here.
messageStoreOnEmulator("DynamoDB Local, bundled", bundled);
mailerOnStandIn("SES against a local stand-in of its API, bundled", bundled);
