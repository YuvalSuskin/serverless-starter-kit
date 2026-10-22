import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// deploy/scripts/*.ts run in Node with type stripping, which resolves a
// relative import only by its full file name; vitest and SST's bundler forgive
// "./cdn" where Node needs "./cdn.ts". A type-only import is erased first.
const dir = new URL("./", import.meta.url);
const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

describe("deploy/src imports that scripts load", () => {
  it.each(sources)("%s names each relative value import's .ts file", (file) => {
    const text = readFileSync(new URL(file, dir), "utf8");
    const bare = [...text.matchAll(/^import (?!type )[^;]*?from "(\.{1,2}\/[^"]+)";/gms)]
      .map((m) => m[1] ?? "")
      .filter((path) => !path.endsWith(".ts") && !path.endsWith(".json"));
    expect(bare).toEqual([]);
  });
});
