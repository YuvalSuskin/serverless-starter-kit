// Bundles each Lambda entry into dist/. dist/meta.json and
// dist/<entry>.meta.json are esbuild's record of every input of each bundle,
// which the bundle tests read. Each build's split-off chunks
// go in dist/chunks/<build>/, emptied first so no older chunk ships.
import { build } from "esbuild";
import { rmSync, writeFileSync } from "node:fs";

import { chunkDir, chunkNames, lambdaBuildOptions } from "./lambda-build";

async function bundle(
  name: string,
  entry: string,
  { meta = `${name}.meta.json` }: { meta?: string } = {},
): Promise<void> {
  rmSync(`dist/${chunkDir(name)}`, { force: true, recursive: true });
  const result = await build({
    ...lambdaBuildOptions,
    chunkNames: chunkNames(name),
    entryPoints: { [name]: entry },
    outdir: "dist",
  });
  writeFileSync(`dist/${meta}`, JSON.stringify(result.metafile, null, 2));
}

await bundle("api", "src/entries/lambda/api.ts", { meta: "meta.json" });
// A second Lambda (a queue worker, a scheduled job) adds its bundle here, and
// its entry in src/entries/lambda/.
