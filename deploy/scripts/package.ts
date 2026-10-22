// Skeleton: `node scripts/package.ts`: each Lambda's folder under .build/,
// from the backend's dist/. `pnpm sst:diff` and `pnpm sst:deploy` run it
// after building the backend.
import { BACKEND_DIST, BUILD_DIR, layOut } from "../src/bundles.ts";

layOut(BACKEND_DIST, BUILD_DIR);

console.log(`Function folders ready in ${BUILD_DIR}/.`);
