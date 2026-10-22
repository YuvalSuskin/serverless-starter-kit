// The bootstrap's resume rule: `.bootstrap/state.json` records each finished
// step, and the next run starts at the first step not finished. Steps 1 to 6
// run in order; step 7 (accounts) is optional and may be deferred.
import { describe, expect, it } from "vitest";

import {
  type BootstrapState,
  InvalidState,
  markStep,
  nextStep,
  parseState,
  stepByName,
  STEPS,
} from "./bootstrap-state.ts";

const done = (...ids: string[]): BootstrapState =>
  parseState({ steps: Object.fromEntries(ids.map((id) => [id, { status: "done" }])) });

describe("STEPS", () => {
  it("are the seven steps of the bootstrap, in order", () => {
    expect(STEPS).toEqual([
      "1-basics",
      "2-product-brief",
      "3-owner-setup",
      "4-design-system",
      "5-scaffold",
      "6-replace-skeleton",
      "7-accounts",
    ]);
  });
});

describe("nextStep", () => {
  it("starts at step 1 with no state file, or an empty state", () => {
    expect(nextStep(undefined)).toBe("1-basics");
    expect(nextStep({})).toBe("1-basics");
    expect(nextStep({ steps: {} })).toBe("1-basics");
  });

  it("resumes at step 2 once step 1 is done", () => {
    expect(nextStep(done("1-basics"))).toBe("2-product-brief");
  });

  it("returns the first unfinished step, even when a later one is done", () => {
    expect(nextStep(done("1-basics", "3-owner-setup"))).toBe("2-product-brief");
    // Step 7 runs any time; doing it early does not skip the others.
    expect(nextStep(done("1-basics", "7-accounts"))).toBe("2-product-brief");
  });

  it("offers step 7 after step 6, until it is done or deferred", () => {
    const sixDone = ["1-basics", "2-product-brief", "3-owner-setup", "4-design-system"];
    expect(nextStep(done(...sixDone, "5-scaffold", "6-replace-skeleton"))).toBe("7-accounts");
    const deferred = markStep(
      done(...sixDone, "5-scaffold", "6-replace-skeleton"),
      "7-accounts",
      "deferred",
      "2026-10-22",
    );
    expect(nextStep(deferred)).toBeNull();
  });

  it("is null when every step is done", () => {
    expect(nextStep(done(...STEPS))).toBeNull();
  });

  it.each([
    "nonsense",
    42,
    [],
    { steps: [] },
    { steps: { "8-launch": { status: "done" } } },
    { steps: { "1-basics": { status: "finished" } } },
    { steps: { "1-basics": "done" } },
    { steps: { "1-basics": { status: "done", date: 3 } } },
    // Only the optional step can be deferred.
    { steps: { "2-product-brief": { status: "deferred" } } },
  ])("refuses %j instead of guessing", (garbage) => {
    expect(() => nextStep(garbage)).toThrow(InvalidState);
  });

  it("is pure: it does not change the state it reads", () => {
    const state = done("1-basics");
    const before = structuredClone(state);
    nextStep(state);
    expect(state).toEqual(before);
  });
});

describe("markStep", () => {
  it("records a step as done with its date, leaving the rest", () => {
    const state = markStep(done("1-basics"), "2-product-brief", "done", "2026-10-22");
    expect(state.steps["2-product-brief"]).toEqual({ status: "done", date: "2026-10-22" });
    expect(state.steps["1-basics"]).toEqual({ status: "done" });
  });

  it("returns a new state", () => {
    const state = done("1-basics");
    markStep(state, "2-product-brief", "done", "2026-10-22");
    expect(state.steps["2-product-brief"]).toBeUndefined();
  });

  it("defers only the optional step", () => {
    expect(() => markStep(done(), "5-scaffold", "deferred", "2026-10-22")).toThrow(InvalidState);
  });

  it("takes a date as YYYY-MM-DD", () => {
    expect(() => markStep(done(), "1-basics", "done", "22/10/2026")).toThrow(InvalidState);
  });
});

describe("stepByName", () => {
  it("finds a step by its id, its name or its number", () => {
    expect(stepByName("7-accounts")).toBe("7-accounts");
    expect(stepByName("accounts")).toBe("7-accounts");
    expect(stepByName("7")).toBe("7-accounts");
    expect(stepByName("product-brief")).toBe("2-product-brief");
  });

  it("finds nothing for another name", () => {
    expect(stepByName("launch")).toBeUndefined();
    expect(stepByName("")).toBeUndefined();
  });
});
