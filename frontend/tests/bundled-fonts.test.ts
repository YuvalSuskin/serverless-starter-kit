// Skeleton: fonts ship with the app and the app fetches none while it runs.
// `next/font/google` downloads a font at build time and
// makes the build depend on a network; Fontsource packages are installed with
// the rest and bundled by the build.
import { globSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const srcDir = path.join(import.meta.dirname, "../src");

// The module as a quoted specifier (an import, a require, a dynamic import), or
// a stylesheet or font URL on Google's font hosts. A comment that names the
// module in backticks (fonts.ts does) is not one.
const GOOGLE_FONTS = /["']next\/font\/google["']|fonts\.googleapis\.com|fonts\.gstatic\.com/;

it("no file under src imports next/font/google", () => {
  const files = globSync("**/*.{ts,tsx,js,jsx,mjs,css}", { cwd: srcDir }).filter((file) =>
    statSync(path.join(srcDir, file)).isFile(),
  );
  expect(files.length).toBeGreaterThan(0);
  const offenders = files.filter((file) =>
    GOOGLE_FONTS.test(readFileSync(path.join(srcDir, file), "utf8")),
  );
  expect(offenders).toEqual([]);
});

it("the pattern finds what it should", () => {
  expect(GOOGLE_FONTS.test('import { Rubik } from "next/font/google";')).toBe(true);
  expect(GOOGLE_FONTS.test("const f = await import('next/font/google')")).toBe(true);
  expect(GOOGLE_FONTS.test("@import url(https://fonts.googleapis.com/css2?family=Inter);")).toBe(
    true,
  );
  expect(GOOGLE_FONTS.test("// Never `next/font/google`")).toBe(false);
  expect(GOOGLE_FONTS.test('import "@fontsource-variable/inter";')).toBe(false);
});
