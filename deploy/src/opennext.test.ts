import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// D4: OpenNext pinned to 4.1.x,
// exactly, through the frontend's lockfile; Next pinned exactly too, and
// upgraded only after OpenNext's release notes confirm support.
const frontend = JSON.parse(
  readFileSync(new URL("../../frontend/package.json", import.meta.url), "utf8"),
) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
};

describe("the OpenNext pin", () => {
  it("is an exact 4.1.x", () => {
    expect(frontend.devDependencies["@opennextjs/aws"]).toMatch(/^4\.1\.\d+$/);
  });

  it("pins Next exactly", () => {
    expect(frontend.dependencies.next).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("is what the deploy builds with", () => {
    expect(frontend.scripts["build:opennext"]).toBe("open-next build");
  });
});
