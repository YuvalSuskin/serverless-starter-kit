import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { describePass, type PassRecord, readPass, writePass } from "./record.ts";

const record: PassRecord = {
  sha: "a".repeat(40),
  passedAt: "2026-10-08T10:00:00.000Z",
  seconds: 552,
  suites: ["format, lint, types, knip", "unit and browser tests"],
  notRun: [],
};

describe("pass records", () => {
  const current = { ...record, node: 24 };

  it("keeps a passed commit, and finds nothing for another", () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), "local-check-")), "check-full");
    expect(readPass(dir, record.sha)).toBeUndefined();
    writePass(dir, current);
    expect(readPass(dir, record.sha)).toEqual(current);
    expect(readPass(dir, "b".repeat(40))).toBeUndefined();
  });

  it("ignores a record whose content names another commit, or is not JSON", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "local-check-"));
    writeFileSync(path.join(dir, `${record.sha}.json`), JSON.stringify({ ...current, sha: "b" }));
    expect(readPass(dir, record.sha)).toBeUndefined();
    writeFileSync(path.join(dir, `${record.sha}.json`), "{");
    expect(readPass(dir, record.sha)).toBeUndefined();
  });

  it("a record from before CI16 names no Node, so it is no pass: the proof job needs the major (CI17)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "local-check-"));
    writePass(dir, record);
    expect(readPass(dir, record.sha)).toBeUndefined();
  });

  it("describes a pass within GitHub's 140 characters", () => {
    expect(describePass(record)).toBe(
      "passed in 9m12s: format, lint, types, knip, unit and browser tests",
    );
    const long = describePass({ ...record, suites: Array.from({ length: 20 }, () => "suite") });
    expect(long).toHaveLength(140);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("what the proof says about e2e (CI15)", () => {
  const full = {
    ...record,
    e2e: { production: ["chromium", "android", "iphone"] },
  };

  it("leads with the projects that ran on the build, so truncation never cuts them", () => {
    expect(describePass(full)).toBe(
      "[e2e production:chromium,android,iphone] passed in 9m12s: format, lint, types, knip, unit and browser tests",
    );
    const long = describePass({ ...full, suites: Array.from({ length: 20 }, () => "suite") });
    expect(long).toHaveLength(140);
    expect(long.startsWith("[e2e production:chromium,android,iphone]")).toBe(true);
  });

  it("a run that ran no e2e says so, with its Node; an old record says nothing about e2e", () => {
    expect(describePass({ ...record, e2e: { production: [] } })).toMatch(
      /^\[e2e none\] passed in 9m12s/,
    );
    expect(describePass({ ...record, e2e: { production: [] }, node: 24 })).toMatch(
      /^\[e2e none node24\] passed in 9m12s/,
    );
    expect(describePass(record)).toMatch(/^passed in 9m12s/);
  });
});

describe("what the proof says about Node (CI16)", () => {
  const e2e = { production: ["chromium"] };

  it("names the Node major the run was made on, inside the e2e token", () => {
    expect(describePass({ ...record, e2e, node: 24 })).toMatch(
      /^\[e2e production:chromium node24\] passed in 9m12s/,
    );
    expect(describePass({ ...record, e2e })).toMatch(
      /^\[e2e production:chromium\] passed in 9m12s/,
    );
  });

  it("keeps the whole token under the 140 characters whatever the suites", () => {
    const all = ["chromium", "android", "iphone"];
    const long = describePass({
      ...record,
      e2e: { production: all },
      node: 24,
      suites: Array.from({ length: 20 }, () => "suite"),
    });
    expect(long).toHaveLength(140);
    expect(long.startsWith("[e2e production:chromium,android,iphone node24]")).toBe(true);
  });

  it("keeps the major in the record", () => {
    const dir = path.join(mkdtempSync(path.join(tmpdir(), "local-check-")), "check-full");
    writePass(dir, { ...record, node: 24, e2e });
    expect(readPass(dir, record.sha)?.node).toBe(24);
  });
});
