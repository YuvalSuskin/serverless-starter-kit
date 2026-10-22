import { describe, expect, it } from "vitest";

import { expectSameBox } from "./geometry";

function mockElement(rect: { top: number; left: number; width: number; height: number }): Element {
  return {
    getBoundingClientRect: () => ({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      bottom: rect.top + rect.height,
      right: rect.left + rect.width,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  } as unknown as Element;
}

describe("expectSameBox", () => {
  const baseRect = { top: 10, left: 20, width: 100, height: 40 };

  it("passes when given two elements with identical bounding rects", () => {
    const el1 = mockElement(baseRect);
    const el2 = mockElement(baseRect);
    expect(() => {
      expectSameBox(el1, el2);
    }).not.toThrow();
  });

  it("passes when delta is within tolerancePx", () => {
    const el1 = mockElement(baseRect);
    const el2 = mockElement({ ...baseRect, top: baseRect.top + 0.5 });
    expect(() => {
      expectSameBox(el1, el2, 1);
    }).not.toThrow();
  });

  it.each(["top", "left", "width", "height"] as const)(
    "throws when shifted by 2px in %s",
    (dimension) => {
      const el1 = mockElement(baseRect);
      const el2 = mockElement({ ...baseRect, [dimension]: baseRect[dimension] + 2 });
      expect(() => {
        expectSameBox(el1, el2);
      }).toThrow(new RegExp(`expectSameBox: ${dimension} differs by 2(\\.00)?px`));
    },
  );

  it.each(["top", "left", "width", "height"] as const)(
    "throws when shifted negatively by 2px in %s",
    (dimension) => {
      const el1 = mockElement(baseRect);
      const el2 = mockElement({ ...baseRect, [dimension]: baseRect[dimension] - 2 });
      expect(() => {
        expectSameBox(el1, el2);
      }).toThrow(new RegExp(`expectSameBox: ${dimension} differs by 2(\\.00)?px`));
    },
  );
});
