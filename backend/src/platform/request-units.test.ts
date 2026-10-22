import { describe, expect, it } from "vitest";

import { itemBytes, readUnits, writeUnits } from "./request-units";

describe("request units", () => {
  it("counts an item's size as UTF-8 JSON", () => {
    expect(itemBytes({ a: "é" })).toBe('{"a":""}'.length + 2);
  });

  it("bills a write per started KB of each item, at least one", () => {
    expect(writeUnits([{}])).toBe(1);
    expect(writeUnits([{ a: "x".repeat(1024) }])).toBe(2);
    expect(writeUnits([{}, {}])).toBe(2);
    expect(writeUnits([])).toBe(0);
  });

  it("bills a consistent read per started 4 KB of everything read, at least one", () => {
    expect(readUnits([])).toBe(1);
    expect(readUnits([{ a: "x".repeat(3000) }, { b: "x".repeat(3000) }])).toBe(2);
  });
});
