// Guard test for the UI fundamentals: every Tailwind transition or animation
// honours reduced motion. Today's existing offenders sit on an allowlist that
// only shrinks.
import { existsSync, globSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { REDUCED_MOTION_ALLOWLIST } from "./ui-fundamentals-allowlist";

const srcDir = path.join(import.meta.dirname, "../src");

const MOTION_TRIGGER = /(?:\btransition\b|\banimate-|\bduration-)/;
const MOTION_EXEMPT = /(?:motion-reduce:|motion-safe:|transition-ui|transition-fade)/;

function getSourceFiles(root: string, pattern = "**/*.tsx"): string[] {
  return globSync(pattern, { cwd: root })
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => {
      const fullPath = path.join(root, file);
      return statSync(fullPath).isFile();
    });
}

function extractStringLiterals(code: string): string[] {
  const withoutComments = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  const literals: string[] = [];
  const stringRegex = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`/g;
  let match: RegExpExecArray | null = stringRegex.exec(withoutComments);
  while (match !== null) {
    literals.push(match[0]);
    match = stringRegex.exec(withoutComments);
  }
  return literals;
}

export function findMotionViolationsInCode(code: string): string[] {
  const literals = extractStringLiterals(code);
  return literals.filter((lit) => MOTION_TRIGGER.test(lit) && !MOTION_EXEMPT.test(lit));
}

export function isReducedMotionViolation(relPath: string, code: string): boolean {
  if (/\.(test|stories)\.[jt]sx?$/.test(relPath)) return false;
  return findMotionViolationsInCode(code).length > 0;
}

export function checkReducedMotion(
  root: string,
  allowlist: readonly string[] = REDUCED_MOTION_ALLOWLIST,
): { violations: string[]; stale: string[] } {
  const files = getSourceFiles(root, "**/*.tsx");
  const violations: string[] = [];

  for (const rel of files) {
    const fullPath = path.join(root, rel);
    const content = readFileSync(fullPath, "utf8");
    if (isReducedMotionViolation(rel, content) && !allowlist.includes(rel)) {
      violations.push(rel);
    }
  }

  const stale = allowlist.filter((rel) => {
    const fullPath = path.join(root, rel);
    if (!existsSync(fullPath) || !statSync(fullPath).isFile()) return true;
    const content = readFileSync(fullPath, "utf8");
    return !isReducedMotionViolation(rel, content);
  });

  return { violations, stale };
}

describe("every transition and animation honours reduced motion", () => {
  it("reports no new violations beyond allowlist, and allowlist has no stale entries", () => {
    const { violations, stale } = checkReducedMotion(srcDir);
    expect(violations, `New reduced motion violations: ${violations.join(", ")}`).toEqual([]);
    expect(stale, `Stale REDUCED_MOTION_ALLOWLIST entries to remove: ${stale.join(", ")}`).toEqual(
      [],
    );
  });

  it("fails on a bare transition-colors (no modifier)", () => {
    const code = '<div className="transition-colors" />';
    expect(findMotionViolationsInCode(code).length).toBeGreaterThan(0);
  });

  it("passes with motion-reduce:transition-none", () => {
    const code = '<div className="transition-colors motion-reduce:transition-none" />';
    expect(findMotionViolationsInCode(code)).toEqual([]);
  });

  it("passes with motion-safe:", () => {
    const code = '<div className="motion-safe:transition-colors" />';
    expect(findMotionViolationsInCode(code)).toEqual([]);
  });

  it("fails the staleness assertion on a deliberately wrong allowlist entry", () => {
    const wrongAllowlist = ["non-existent-file.tsx", "ui/button.tsx"];
    const { stale } = checkReducedMotion(srcDir, wrongAllowlist);
    expect(stale).toEqual(["non-existent-file.tsx", "ui/button.tsx"]);
  });
});
