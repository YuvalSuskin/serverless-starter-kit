// The real data: the checks fail when docs/competitors/ breaks a rule, including on a
// docs-only change (turbo.json makes docs/ an input of this test, and
// pnpm check:full runs `pnpm competitors check` on every change, CI17).
import path from "node:path";
import { expect, it } from "vitest";

import { check } from "./check.ts";
import { competitorsDir, readYamlList } from "./files.ts";
import { Feature, Persona } from "./schema.ts";
import { fixtureRoot } from "./testing.ts";

const REPO = path.join(import.meta.dirname, "../../..");

// The template ships without competitor data; the skill creates the folder.
// The taxonomy's shape is proved on the valid fixture, which is laid out like it.
it("reads a taxonomy of features and personas", () => {
  const taxonomy = path.join(competitorsDir(fixtureRoot("valid")), "taxonomy");
  expect(readYamlList(path.join(taxonomy, "features.yaml"), Feature).length).toBeGreaterThan(0);
  expect(readYamlList(path.join(taxonomy, "personas.yaml"), Persona).length).toBeGreaterThan(0);
});

it("keeps every rule in docs/competitors/", () => {
  expect(check(REPO)).toEqual([]);
});
