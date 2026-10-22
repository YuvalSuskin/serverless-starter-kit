// Lint for @acme/review-batch: the shared base only (backend scaffold spec §13.3).
import { formatting, hygiene, tests, typescript } from "@acme/config/eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  ...typescript({ tsconfigRootDir: import.meta.dirname }),
  ...hygiene,
  ...tests,
  formatting,
]);
