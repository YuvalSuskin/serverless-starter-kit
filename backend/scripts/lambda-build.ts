// How every Lambda bundle is built: Node 24, ESM, minified, with
// source maps. scripts/build.ts builds dist/ with these options, and
// tests/contracts/bundled.emulator.test.ts builds the real adapters with them,
// so the contract suites also run against the code as bundled. The AWS SDK is
// bundled, not taken from the runtime, so the version we pinned is the version
// we run.
import type { BuildOptions } from "esbuild";

export const lambdaBuildOptions = {
  // Some CommonJS dependencies call require(); give the ESM bundle one.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  bundle: true,
  format: "esm",
  legalComments: "none",
  // For platform "node" esbuild takes a package's CommonJS build ("main")
  // before its ES module build ("module"), and CommonJS does not tree-shake.
  mainFields: ["module", "main"],
  metafile: true,
  minify: true,
  // The AWS SDK's errors decide instanceof by class name. Minified, every
  // class is renamed and any error of a service passed for any other: a
  // throttled write for a lost race (tests/bundle/sdk-errors.test.ts).
  keepNames: true,
  outExtension: { ".js": ".mjs" },
  platform: "node",
  sourcemap: true,
  // Code a cold start never runs stays out of the file it loads: what is only
  // imported dynamically (the SDK's other credential providers, the API's
  // SES client) goes in chunks of its own, loaded on first use. Measured on
  // the API bundle under Node 24: about 22% less time to load.
  splitting: true,
  target: "node24",
} satisfies BuildOptions;

/** Where a build's chunks go, under dist/ and in each function's folder alike (deploy/src/bundles.ts). */
export const chunkDir = (build: string) => `chunks/${build}`;

/** esbuild's chunkNames for a build: its own folder, so builds never share or overwrite one. */
export const chunkNames = (build: string) => `${chunkDir(build)}/[name]-[hash]`;
