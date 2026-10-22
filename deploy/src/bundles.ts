// Skeleton: each Lambda's code folder. `pnpm build` in backend/ makes every
// bundle in one dist/; each function gets a folder holding only its own
// bundle. scripts/package.ts runs this before every diff and deploy. A
// function that needs a package installed beside its bundle (sharp, say) adds
// its own manifests and an install step here.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Relative to deploy/, where SST runs. */
export const BACKEND_DIST = "../backend/dist";
export const BUILD_DIR = ".build";

interface Bundle {
  /** The folder under BUILD_DIR, which the function's `bundle` points at. */
  dir: string;
  /** The entry first: its name names its chunks' folder. */
  files: [string, ...string[]];
}

// A folder per function: SST writes each function's own files (its encrypted
// resources) into the folder it deploys, so two functions never share one.
export const BUNDLES = {
  api: { dir: "api", files: ["api.mjs", "api.mjs.map"] },
} as const satisfies Record<string, Bundle>;

/**
 * A bundle's chunks: the backend's build splits each entry,
 * and puts what its entry imports in dist/chunks/<entry>/
 * (backend/scripts/lambda-build.ts), at the same path in the function's
 * folder, where the entry's imports find them.
 */
const chunksOf = (bundle: Bundle) => join("chunks", bundle.files[0].replace(/\.mjs$/, ""));

/** A function's folder, as its `bundle` names it. */
export const bundleDir = (bundle: Bundle) => `${BUILD_DIR}/${bundle.dir}`;

/**
 * Copies each bundle into its folder under `outDir`. Everything already
 * there is replaced, so no file of an older build ships.
 */
export function layOut(distDir: string, outDir: string): void {
  for (const bundle of Object.values(BUNDLES) as Bundle[]) {
    const chunks = chunksOf(bundle);
    for (const file of [...bundle.files, chunks]) {
      if (!existsSync(join(distDir, file))) {
        throw new Error(`${join(distDir, file)} is missing: run pnpm build in backend/ first`);
      }
    }
    const dir = join(outDir, bundle.dir);
    mkdirSync(dir, { recursive: true });
    for (const entry of readdirSync(dir))
      rmSync(join(dir, entry), { force: true, recursive: true });
    for (const file of bundle.files) cpSync(join(distDir, file), join(dir, file));
    cpSync(join(distDir, chunks), join(dir, chunks), { recursive: true });
  }
}
