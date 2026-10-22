import type { Plugin } from "vite";

// Vitest's browser projects run on a Vite server that bundles the packages
// the tests import before the browsers start. A package it finds only once
// tests are running is bundled then, and Vite reloads every test page to load
// it ("optimized dependencies changed. reloading"). The reloaded pages lose
// their place: files report no tests, imports of the old bundle fail ("Failed
// to fetch dynamically imported module", two copies of React), or the run
// waits for results that never come, at 0% CPU, for hours.
// Nothing that runs after the reload can be trusted, so this ends the run at
// once with what to do instead. vitest.config.ts makes the scan find every
// package first; this catches whatever it still misses.
const RELOADING = "optimized dependencies changed. reloading";
const FOUND = /dependenc(?:y|ies) optimized: (.+)/;

const stripColours = (text: string) => text.replace(/\u001B\[[0-9;]*m/g, "");

export function depsReloadTripwire(
  project: string,
  fail: (message: string) => never = (message) => {
    console.error(message);
    process.exit(1);
  },
): Plugin {
  return {
    name: "acme:deps-reload-tripwire",
    apply: "serve",
    configureServer(server) {
      const { logger } = server.config;
      const info = logger.info.bind(logger);
      let found = "";
      logger.info = (message, options) => {
        info(message, options);
        const text = stripColours(message);
        found = FOUND.exec(text)?.[1] ?? found;
        if (!text.includes(RELOADING)) return;
        fail(
          [
            "",
            `[${project}] Vite found ${found === "" ? "a package" : found} only once tests were running, and reloaded the test pages.`,
            "A run that goes on after that fails at random or hangs, so it stops here.",
            `Add ${found === "" ? "the package" : found} to this project's optimizeDeps.include in frontend/vitest.config.ts,`,
            "or check that the files importing it are in the project's optimizeDeps.entries.",
            "",
          ].join("\n"),
        );
      };
    },
  };
}
