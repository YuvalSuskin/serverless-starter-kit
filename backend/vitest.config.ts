import { defineConfig } from "vitest/config";

// Three projects. `unit` needs nothing; `contract` needs Docker for
// the emulators; `bundle` needs `pnpm build` first. A project that runs only by
// hand (suites against a real paid service) is added beside them when one
// exists, and `pnpm check` never runs it.
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          environment: "node",
          exclude: ["tests/contracts/*.emulator.test.ts", "tests/bundle/**"],
          include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
          name: "unit",
        },
      },
      {
        extends: true,
        test: {
          environment: "node",
          globalSetup: ["tests/contracts/emulators.ts"],
          hookTimeout: 120_000,
          include: ["tests/contracts/*.emulator.test.ts"],
          name: "contract",
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          environment: "node",
          // Importing the built bundle transforms all of it: 11 s on a busy
          // 2-core CI runner, past the default 10 s.
          hookTimeout: 60_000,
          include: ["tests/bundle/*.test.ts"],
          name: "bundle",
        },
      },
    ],
  },
});
