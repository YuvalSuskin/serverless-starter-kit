import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { bundleDir, BUNDLES, layOut } from "./bundles";

const sorted = (names: string[]) => names.toSorted((a, b) => a.localeCompare(b));

function fakeDist() {
  const dir = mkdtempSync(join(tmpdir(), "dist-"));
  for (const name of ["api", "other"]) {
    for (const file of [`${name}.mjs`, `${name}.mjs.map`, `${name}.meta.json`]) {
      writeFileSync(join(dir, file), file);
    }
    mkdirSync(join(dir, "chunks", name), { recursive: true });
    writeFileSync(join(dir, "chunks", name, "chunk-A1.mjs"), name);
  }
  return dir;
}

describe("layOut", () => {
  it("gives the API its own folder holding only its bundle and its chunks", () => {
    const out = mkdtempSync(join(tmpdir(), "build-"));
    layOut(fakeDist(), out);
    expect(sorted(readdirSync(join(out, "api")))).toEqual(["api.mjs", "api.mjs.map", "chunks"]);
    expect(readFileSync(join(out, "api", "chunks", "api", "chunk-A1.mjs"), "utf8")).toBe("api");
    expect(readdirSync(out)).toEqual(["api"]);
  });

  it("drops files a previous build left", () => {
    const out = mkdtempSync(join(tmpdir(), "build-"));
    mkdirSync(join(out, "api"));
    writeFileSync(join(out, "api", "stale.mjs"), "");
    layOut(fakeDist(), out);
    expect(existsSync(join(out, "api", "stale.mjs"))).toBe(false);
  });

  it("fails, naming the file, when the backend was not built", () => {
    const out = mkdtempSync(join(tmpdir(), "build-"));
    expect(() => {
      layOut(mkdtempSync(join(tmpdir(), "empty-")), out);
    }).toThrow(/api\.mjs.*pnpm build/);
  });
});

describe("bundleDir", () => {
  it("is where SST reads the function's code", () => {
    expect(bundleDir(BUNDLES.api)).toBe(".build/api");
  });
});
