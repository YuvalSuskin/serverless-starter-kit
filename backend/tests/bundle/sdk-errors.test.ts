// The adapters tell one AWS error from another with `instanceof` (a lost
// race, a cancelled transaction). The SDK decides that by class name, so the
// Lambda bundles must keep names when they minify: without it, an archived
// object's refused read passed for a missing file (seen once on a deployed stage).
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { lambdaBuildOptions } from "../../scripts/lambda-build";

describe("AWS SDK errors, bundled as the Lambdas are", () => {
  it("are only instances of their own class", async () => {
    const outdir = mkdtempSync(path.join(tmpdir(), "sdk-errors-"));
    await build({
      ...lambdaBuildOptions,
      entryPoints: { probe: path.join(import.meta.dirname, "sdk-errors.entry.ts") },
      outdir,
    });
    const { matches } = (await import(path.join(outdir, "probe.mjs"))) as {
      matches: () => Record<string, boolean>;
    };
    expect(matches()).toEqual({
      conditionFailedIsCancelled: false,
      conditionFailedIsConditionFailed: true,
      transactionIsConditionFailed: false,
      transactionIsTransaction: true,
    });
  }, 60_000);
});
