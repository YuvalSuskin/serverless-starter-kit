import { expect, it } from "vitest";

import type { Run } from "./exec.ts";

import { nextIds, readState, type SweepState, writeState } from "./state.ts";
import { sampleFindingLine } from "./testing.ts";

/** A fake bd kv store: records every call, answers list and set. */
function fakeBd(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { "memory.fewer-questions": "x", ...initial };
  const calls: string[][] = [];
  const run: Run = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (args.join(" ") === "kv list --json") return JSON.stringify(store);
    if (args[0] === "kv" && args[1] === "set") {
      store[args[2] ?? ""] = args[3] ?? "";
      return "";
    }
    throw new Error(`unexpected: ${cmd} ${args.join(" ")}`);
  };
  return { run, store, calls };
}

const STATE: SweepState = {
  commit: "4b64960",
  date: "2026-10-01",
  batch: 2,
  pr: 31,
  verify: "passed",
  mergedCommit: null,
  graphKey: "abc",
  nextId: 7,
};

it("reads no state when the key is absent", () => {
  expect(readState(fakeBd().run)).toBeNull();
});

it("round-trips the state through bd kv, under sweep/last-run", () => {
  const bd = fakeBd();
  writeState(bd.run, STATE);
  expect(Object.keys(bd.store)).toContain("sweep/last-run");
  expect(readState(bd.run)).toEqual(STATE);
});

it("refuses a stored state that does not parse", () => {
  expect(() => readState(fakeBd({ "sweep/last-run": '{"commit":1}' }).run)).toThrow(
    /sweep\/last-run/,
  );
});

it("hands out finding IDs from nextId, padded to three digits", () => {
  expect(nextIds(STATE, 3, [])).toEqual(["SW-007", "SW-008", "SW-009"]);
  expect(nextIds({ ...STATE, nextId: 1234 }, 1, [])).toEqual(["SW-1234"]);
});

it("never reissues an ID the ledger already holds, even if bd kv fell behind", () => {
  const line = sampleFindingLine();
  const held = { ...line, finding: { ...line.finding, id: "SW-012" } };
  expect(nextIds({ ...STATE, nextId: 3 }, 2, [held])).toEqual(["SW-013", "SW-014"]);
});
