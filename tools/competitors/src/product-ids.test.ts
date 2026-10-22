import { describe, expect, it } from "vitest";

import { readProductIds } from "./product-ids.ts";
import { edit, fixtureRoot } from "./testing.ts";

describe("readProductIds", () => {
  it("reads the IDs of the first table in the glossary and the actors files", () => {
    const ids = readProductIds(fixtureRoot("valid"));
    expect([...ids.glossary]).toEqual(["library", "shared-list"]);
    expect([...ids.actors]).toEqual(["partner", "member"]);
  });

  it("leaves out a withdrawn row: one whose other cells are struck through", () => {
    expect(readProductIds(fixtureRoot("valid")).glossary.has("story")).toBe(false);
  });

  it("fails loudly when a file has no ID table", () => {
    const root = fixtureRoot("valid");
    edit(root, "docs/product/shared/actors.md", () => "# Actors\n\nNo table.\n");
    expect(() => readProductIds(root)).toThrow(/actors\.md.*ID/);
  });
});
