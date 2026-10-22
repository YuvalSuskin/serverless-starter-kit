// Lint for @acme/deploy: the shared base only.
import { formatting, hygiene, tests, typescript } from "@acme/config/eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // SST's downloaded platform code and the file it generates on each run.
  // .build/: the bundles and sharp scripts/package.ts lays out for Lambda.
  { ignores: [".sst/**", ".build/**", "**/sst-env.d.ts"] },
  ...typescript({ tsconfigRootDir: import.meta.dirname }),
  // sst.config.ts is typed against SST's own platform source, which needs
  // looser compiler settings than ours (tsconfig.sst.json).
  {
    files: ["sst.config.ts"],
    languageOptions: {
      parserOptions: { project: "./tsconfig.sst.json", projectService: false },
    },
    // SST's globals (sst, aws, $config) come from a triple-slash reference.
    rules: { "@typescript-eslint/triple-slash-reference": "off" },
  },
  ...hygiene,
  ...tests,
  // The deploy scripts run the developer's own sst and aws CLIs, found on
  // PATH (pnpm puts sst there); there is no fixed location.
  { files: ["scripts/**/*.ts"], rules: { "sonarjs/no-os-command-from-path": "off" } },
  formatting,
]);
