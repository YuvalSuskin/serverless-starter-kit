import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// The frontend's build reads .env files (SITE_URL is baked in), so they must
// be part of the build's cache key, or a cached build could keep an old or
// missing value.
describe("turbo.json", () => {
  it("counts the .env files as build inputs", async () => {
    const turbo = JSON.parse(
      await readFile(new URL("../../turbo.json", import.meta.url), "utf8"),
    ) as {
      tasks: Record<string, { inputs?: string[] }>;
    };
    const build = turbo.tasks.build ?? turbo.tasks["@acme/frontend#build"];
    expect(build?.inputs).toEqual(expect.arrayContaining(["$TURBO_DEFAULT$", ".env*"]));
  });

  it("keys the build on the site's address", async () => {
    const turbo = JSON.parse(
      await readFile(new URL("../../turbo.json", import.meta.url), "utf8"),
    ) as {
      tasks: Record<string, { env?: string[] }>;
    };
    expect(turbo.tasks.build?.env).toContain("SITE_URL");
  });
});
