// Test code only: lint rejects an import of this module from product code.

import { expect } from "vitest";

export function expectSameBox(before: Element, after: Element, tolerancePx = 1): void {
  const b = before.getBoundingClientRect();
  const a = after.getBoundingClientRect();

  const dimensions = [
    { name: "top", before: b.top, after: a.top },
    { name: "left", before: b.left, after: a.left },
    { name: "width", before: b.width, after: a.width },
    { name: "height", before: b.height, after: a.height },
  ] as const;

  for (const dim of dimensions) {
    const diff = Math.abs(dim.before - dim.after);
    expect(
      diff,
      `expectSameBox: ${dim.name} differs by ${diff.toFixed(2)}px (before: ${String(dim.before)}px, after: ${String(dim.after)}px, tolerance: ${String(tolerancePx)}px)`,
    ).toBeLessThanOrEqual(tolerancePx);
  }
}
