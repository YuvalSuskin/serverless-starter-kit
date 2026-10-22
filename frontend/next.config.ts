import type { NextConfig } from "next";

import { createRequire } from "node:module";
import path from "node:path";

// Turbopack's root MUST stay the workspace root, which Next infers from
// ../pnpm-lock.yaml. @acme/design (../design) and the pnpm store both live
// outside frontend/, so a `turbopack.root` pinned to this folder, or a lockfile
// or .git inside it, breaks the build.
//
// No `output` setting: OpenNext (D4, provisional) packages the app and builds
// Next in standalone mode itself (`pnpm build:opennext`, run in CI), and
// `next start`, which `pnpm e2e` uses, refuses `output: 'standalone'`. The
// container fallback adds it back with a Dockerfile.

// The backend's dev server (`pnpm dev` starts both). The API is same-origin
// under /api/, and media under /media/: in
// development Next proxies both; in production CloudFront routes them, so
// nothing is proxied here.
// DEV_API_PORT (8787 by default) is how `pnpm preview` runs several at once.
const DEV_API_PORT = process.env.DEV_API_PORT ?? "8787";
if (!/^\d{1,5}$/.test(DEV_API_PORT)) {
  throw new Error(`DEV_API_PORT must be a port number, got "${DEV_API_PORT}"`);
}
const DEV_API_ORIGIN = `http://127.0.0.1:${DEV_API_PORT}`;

// Motion's `motion/react` re-exports framer-motion, and also copies
// `fm.motion` into a binding of its own (motion's react.mjs), which Turbopack
// keeps with all it reaches: the full `motion` component and its every feature
// (drag, pan, layout projection), about 18 KB compressed, on every page that
// imports anything from Motion. No page uses
// `motion.*`; each takes `m` under LazyMotion. So `motion/react` resolves to
// the very framer-motion it re-exports, found through motion itself so the two
// never drift apart: the same exports, without that binding. PV60.
const fromMotion = createRequire(createRequire(import.meta.url).resolve("motion/package.json"));
const FRAMER_MOTION = `./${path.relative(
  import.meta.dirname,
  path.dirname(fromMotion.resolve("framer-motion/package.json")),
)}`;

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "motion/react": FRAMER_MOTION,
    },
  },
  // No x-powered-by: Next.js on every answer.
  poweredByHeader: false,
  // @acme/contracts ships TypeScript source, with no build step.
  transpilePackages: ["@acme/contracts"],
  // Never Next's image optimiser (D4): the backend makes the sizes.
  images: { loader: "custom", loaderFile: "./src/lib/image-loader.ts" },
  rewrites: () =>
    Promise.resolve(
      process.env.NODE_ENV === "development"
        ? [
            { destination: `${DEV_API_ORIGIN}/api/:path*`, source: "/api/:path*" },
            { destination: `${DEV_API_ORIGIN}/media/:path*`, source: "/media/:path*" },
          ]
        : [],
    ),
};

export default nextConfig;
