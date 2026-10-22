// Lint for @acme/bootstrap: the shared base only.
import { formatting, hygiene, tests, typescript } from "@acme/config/eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  ...typescript({ tsconfigRootDir: import.meta.dirname }),
  ...hygiene,
  ...tests,
  // This package runs the developer's own git, pnpm and bd, found on PATH
  // exactly as their shell finds them; there is no fixed location.
  { rules: { "sonarjs/no-os-command-from-path": "off" } },
  formatting,
]);
