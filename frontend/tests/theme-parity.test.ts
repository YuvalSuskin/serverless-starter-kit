// cn() must know every brand text size and radius the @theme defines, or
// tailwind-merge misreads them (text-100 as a colour, say) and silently drops
// classes. This fails the moment globals.css and src/lib/utils.ts drift apart.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, it } from "vitest";

import { MOTION } from "../src/lib/motion";
import { BRAND_RADII, BRAND_TEXT_STEPS } from "../src/lib/utils";

const css = readFileSync(path.join(import.meta.dirname, "../src/app/globals.css"), "utf8");

const require = createRequire(import.meta.url);
const tokensCss = readFileSync(require.resolve("@acme/design/tokens.css"), "utf8");

function themeNames(namespace: string): string[] {
  return [...css.matchAll(new RegExp(`--${namespace}-([a-z0-9]+):`, "g"))].map(
    (match) => match[1] ?? "",
  );
}

function motionDurationInSeconds(token: "fast" | "base" | "slow"): number {
  const match = new RegExp(`--motion-${token}:\\s*([0-9.]+)ms;`).exec(tokensCss);
  if (!match?.[1]) throw new Error(`Missing motion token --motion-${token} in tokens.css`);
  return Number.parseFloat(match[1]) / 1000;
}

it("cn() knows every text size in the @theme", () => {
  expect([...BRAND_TEXT_STEPS]).toEqual(themeNames("text"));
});

it("cn() knows every radius in the @theme", () => {
  expect([...BRAND_RADII]).toEqual(themeNames("radius"));
});

it("MOTION matches motion tokens in tokens.css", () => {
  expect(MOTION.fast).toBe(motionDurationInSeconds("fast"));
  expect(MOTION.base).toBe(motionDurationInSeconds("base"));
  expect(MOTION.slow).toBe(motionDurationInSeconds("slow"));
});

it("globals.css maps only tokens that tokens.css defines", () => {
  const defined = new Set([...tokensCss.matchAll(/--([a-z][a-z0-9-]*):/g)].map((m) => m[1] ?? ""));
  const own = new Set([...css.matchAll(/--([a-z][a-z0-9-]*):/g)].map((m) => m[1] ?? ""));
  const used = [...css.matchAll(/var\(--([a-z][a-z0-9-]*)\)/g)].map((m) => m[1] ?? "");
  const missing = used.filter((name) => !defined.has(name) && !own.has(name));
  expect(missing).toEqual([]);
});
