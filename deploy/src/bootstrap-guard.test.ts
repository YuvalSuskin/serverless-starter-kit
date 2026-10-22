// The deploy guard: until bootstrap step 6 replaces the skeleton, `sst:deploy`
// refuses, because the skeleton's demo routes are unauthenticated. `sst:diff`
// still runs. No state file means the bootstrap is over: nothing is refused.
import { describe, expect, it } from "vitest";

import { bootstrapStateText, deployRefusal } from "./bootstrap-guard";

const state = (steps: object) => JSON.stringify({ steps });

describe("deployRefusal", () => {
  it("refuses a deploy while step 6 is not done, naming it and why", () => {
    for (const text of [state({}), state({ "1-basics": { status: "done" } })]) {
      const message = deployRefusal("deploy", text);
      expect(message).toContain("/bootstrap replace-skeleton");
      expect(message).toContain("unauthenticated");
    }
  });

  it("lets a deploy through once step 6 is done", () => {
    expect(
      deployRefusal("deploy", state({ "6-replace-skeleton": { status: "done" } })),
    ).toBeUndefined();
  });

  // The rule below is for a project that deleted .bootstrap/; the template
  // ships the file (every step pending) and Finishing keeps it, so a repo from
  // the template is never let through by a file gone missing.
  it("reads this repo's own state file, which the template ships and Finishing keeps", () => {
    const text = bootstrapStateText({});
    expect(text).toBeDefined();
    const done = (JSON.parse(text ?? "{}") as { steps: Record<string, { status?: string }> }).steps[
      "6-replace-skeleton"
    ]?.status;
    expect(deployRefusal("deploy", text) === undefined).toBe(done === "done");
  });

  it("lets a deploy through with no state file: the bootstrap is over", () => {
    expect(deployRefusal("deploy", undefined)).toBeUndefined();
  });

  it("refuses a deploy over a state file that is not one, rather than guess", () => {
    expect(deployRefusal("deploy", "{not json")).toContain(".bootstrap/state.json");
    expect(deployRefusal("deploy", "[]")).toContain(".bootstrap/state.json");
  });

  it("never stops a diff, which changes nothing", () => {
    expect(deployRefusal("diff", state({}))).toBeUndefined();
  });
});
