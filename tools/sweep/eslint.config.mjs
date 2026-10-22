// Lint for @acme/sweep: the shared base only (backend scaffold spec §13.3).
import { formatting, hygiene, tests, typescript } from "@acme/config/eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  ...typescript({ tsconfigRootDir: import.meta.dirname }),
  ...hygiene,
  ...tests,
  // This package runs the developer's own git and bd, found on PATH exactly as
  // their shell finds them (as tools/preview does).
  { rules: { "sonarjs/no-os-command-from-path": "off" } },
  formatting,
]);
