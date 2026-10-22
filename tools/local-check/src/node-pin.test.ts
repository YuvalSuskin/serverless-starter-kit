import { describe, expect, it } from "vitest";

import { majorOf, nodeProblem } from "./node-pin.ts";

describe("majorOf", () => {
  it("reads .nvmrc's text and process.version alike", () => {
    expect(majorOf("24.21.0")).toBe(24);
    expect(majorOf("24.21.0\n")).toBe(24);
    expect(majorOf("v26.8.1")).toBe(26);
    expect(majorOf("24")).toBe(24);
    expect(majorOf("v24")).toBe(24);
  });

  it("reads nothing else", () => {
    for (const odd of [undefined, "", "lts/*", "node", "x24.1.0", "24x", ".24"]) {
      expect(majorOf(odd)).toBeUndefined();
    }
  });
});

describe("nodeProblem (CI16)", () => {
  it("is nothing on the pinned major, whatever the minor", () => {
    expect(nodeProblem({ pinned: "24.21.0\n", actual: "v24.21.0" })).toBeUndefined();
    expect(nodeProblem({ pinned: "24.21.0", actual: "v24.3.1" })).toBeUndefined();
  });

  it("names both Nodes and how to switch on another major", () => {
    const problem = nodeProblem({ pinned: "24.21.0\n", actual: "v26.8.1" });
    expect(problem).toContain("Node v26.8.1");
    expect(problem).toContain("runs Node 24");
    expect(problem).toContain("(.nvmrc: 24.21.0)");
    expect(problem).toContain("pnpm env use --global 24");
    expect(problem).toContain("nvm use");
  });

  it("is nothing when the pin or the version cannot be read", () => {
    expect(nodeProblem({ pinned: undefined, actual: "v26.8.1" })).toBeUndefined();
    expect(nodeProblem({ pinned: "lts/*", actual: "v26.8.1" })).toBeUndefined();
    expect(nodeProblem({ pinned: "24.21.0", actual: "weird" })).toBeUndefined();
  });
});
