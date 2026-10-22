// Tier 1 rule: every component in src/ui/ has a story next to it.
import { existsSync, globSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const uiDir = path.join(import.meta.dirname, "../src/ui");

it("every src/ui component has a sibling story", () => {
  const components = globSync("**/*.tsx", { cwd: uiDir }).filter(
    (file) => !/\.(stories|test)\.tsx$/.test(file) && path.basename(file) !== "index.tsx",
  );
  const missing = components.filter(
    (file) => !existsSync(path.join(uiDir, file.replace(/\.tsx$/, ".stories.tsx"))),
  );

  expect(components.length).toBeGreaterThan(0);
  expect(missing, "components without a .stories.tsx").toEqual([]);
});
