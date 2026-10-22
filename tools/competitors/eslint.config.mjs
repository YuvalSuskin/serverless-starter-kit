// Lint for @acme/competitors: the shared base only.
import { formatting, hygiene, tests, typescript } from "@acme/config/eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  ...typescript({ tsconfigRootDir: import.meta.dirname }),
  ...hygiene,
  ...tests,
  // Like tools/preview: `check --against` and its tests run the developer's
  // own git, found on PATH exactly as their shell finds it.
  { rules: { "sonarjs/no-os-command-from-path": "off" } },
  formatting,
]);
