import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import path from "node:path";
import { devices } from "playwright";
import { defineConfig } from "vitest/config";

import { PHONES } from "./e2e/phones";
import { depsReloadTripwire } from "./tests/deps-reload-tripwire";

const dirname = import.meta.dirname;

// Every test page reports no preference for reduced motion, whatever the host
// says (Playwright's default, written down): the settled stories turn motion
// off themselves (.storybook/preview.tsx), and a story that tests motion sees
// it on, on any machine, with no DevTools call per story.
const contextOptions = { reducedMotion: "no-preference" as const };

// Headless Chromium for the browser-mode projects. A function, not a shared
// object: Vitest writes a generated name onto each project's `instances`, so
// sharing one object makes two projects collide on the same name.
const chromium = () => ({
  enabled: true,
  headless: true,
  provider: playwright({ contextOptions }),
  instances: [{ browser: "chromium" as const }],
});

// The Android phone, in Chromium: its touch, user
// agent and scale factor go to the browser context, its size to the instance.
// WebKit runs only in e2e, so the fast CI job never installs it.
const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices[PHONES.android];
const mobile = () => ({
  enabled: true,
  headless: true,
  provider: playwright({
    contextOptions: { ...contextOptions, userAgent, deviceScaleFactor, isMobile, hasTouch },
  }),
  instances: [{ browser: "chromium" as const, viewport }],
});

// Each browser project's Vite server bundles the packages its tests import
// before the browsers start, and must find all of them then: one found while
// tests run reloads every test page, and the run fails at random or hangs
// (tests/deps-reload-tripwire.ts, which stops such a run). So the scan starts
// from the project's own globs, and runs on every start. Vitest gives it each
// test file's path, which Vite reads as a glob: a path through `[code]` or
// `(group)` matches nothing, and those files' packages were missed (nuqs).
// The bundle it keeps between runs is not trusted: once a branch first
// imports a package that was already installed, the kept one lacks it.
const scanFrom = (entries: string[]) => ({ entries, force: true });

// The file extension picks the environment. There is no jsdom.
export default defineConfig({
  resolve: { alias: { "@": path.join(dirname, "src") } },
  test: {
    testTimeout: 30000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
        },
      },
      {
        extends: true,
        plugins: [depsReloadTripwire("browser")],
        optimizeDeps: scanFrom(["src/**/*.test.tsx", "!src/**/*.mobile.test.tsx"]),
        test: {
          name: "browser",
          include: ["src/**/*.test.tsx"],
          exclude: ["src/**/*.mobile.test.tsx"],
          browser: chromium(),
        },
      },
      {
        extends: true,
        plugins: [depsReloadTripwire("browser-mobile")],
        optimizeDeps: scanFrom(["src/**/*.mobile.test.tsx"]),
        test: { name: "browser-mobile", include: ["src/**/*.mobile.test.tsx"], browser: mobile() },
      },
      {
        extends: true,
        plugins: [
          storybookTest({ configDir: path.join(dirname, ".storybook") }),
          depsReloadTripwire("storybook"),
        ],
        // The plugin scans from the stories' globs (.storybook/main.ts).
        optimizeDeps: { force: true },
        test: { name: "storybook", browser: chromium() },
      },
      // Stories tagged `mobile` again, on the phone and at its size.
      // The plugin sizes each story from Storybook's viewport globals, not
      // from the instance's viewport, hence initialGlobals.
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
            tags: { include: ["mobile"] },
            initialGlobals: { viewport: { value: "mobile" } },
          }),
          // The plugin keeps its bundle in a folder named after configDir,
          // the same for both story projects. Both build it as they start, at
          // once: one renamed the folder away while the other's pages loaded
          // from it ("Failed to fetch dynamically imported module
          // …/sb-vitest/deps/…"). After the plugin, so this one stands.
          {
            name: "acme:storybook-mobile-cache",
            config: () => ({
              cacheDir: path.join(dirname, "node_modules/.cache/sb-vitest-mobile"),
            }),
          },
          depsReloadTripwire("storybook-mobile"),
        ],
        optimizeDeps: { force: true },
        test: { name: "storybook-mobile", browser: mobile() },
      },
    ],
  },
});
