import { describe, expect, it } from "vitest";

import { coverageToken, e2eMatrix, fullMatrix, parseProof, proofScope } from "./e2e-matrix.ts";

const all = { production: ["chromium", "android", "iphone"] };
const noPhone = { production: ["chromium", "android"] };

describe("the full matrix", () => {
  it("is CI4's two jobs, each with the engines of its projects", () => {
    expect(fullMatrix()).toEqual([
      { projects: "chromium android", browsers: "chromium", build: "production" },
      { projects: "iphone", browsers: "webkit", build: "production" },
    ]);
  });
});

describe("the proof's e2e token", () => {
  it("names the build and the projects that ran on it, first in the description", () => {
    expect(coverageToken(all)).toBe("e2e production:chromium,android,iphone");
    expect(coverageToken({ production: [] })).toBe("e2e none");
  });

  it("ends with the Node major the run was made on, e2e or none (CI16, CI17)", () => {
    expect(coverageToken(noPhone, 24)).toBe("e2e production:chromium,android node24");
    expect(coverageToken({ production: [] }, 24)).toBe("e2e none node24");
    expect(parseProof("[e2e none node24] passed")).toEqual({
      coverage: { production: [] },
      node: 24,
    });
    for (const odd of ["[e2e none production:chromium node24] x", "[e2e node24 none] x"]) {
      expect(parseProof(odd)).toEqual({
        coverage: { production: [] },
        node: undefined,
      });
    }
  });

  it("reads back what it wrote, and nothing from anything else (CI15)", () => {
    for (const coverage of [all, noPhone]) {
      expect(parseProof(`[${coverageToken(coverage)}] passed in 9m12s: x`)).toEqual({
        coverage,
        node: undefined,
      });
      expect(parseProof(`[${coverageToken(coverage, 24)}] passed in 9m12s: x`)).toEqual({
        coverage,
        node: 24,
      });
    }
    const none = { coverage: { production: [] }, node: undefined };
    expect(parseProof("[e2e none] passed in 9m12s")).toEqual(none);
    for (const unreadable of [
      undefined,
      "",
      "passed in 9m12s: format, lint",
      "[e2e] passed",
      "[e2e production:chromium",
      "[e2e staging:chromium] x",
      "[e2e production:chro mium] x",
      "[e2e production:chromium;rm -rf] x",
      "x [e2e production:chromium] passed",
      "[e2e production:chromium node] x",
      "[e2e production:chromium node24x] x",
      "[e2e production:chromium node2400] x",
    ]) {
      expect(parseProof(unreadable)).toEqual(none);
    }
  });
});

describe("e2eMatrix: what the proof did not cover", () => {
  const pr = "pull_request";

  it("a proof that covered every project: no e2e job at all", () => {
    const result = e2eMatrix({
      event: pr,
      description: `[${coverageToken(all, 24)}] passed`,
      ciNode: 24,
    });
    expect(result.entries).toEqual([]);
  });

  it("a proof from a machine without WebKit (macOS below 15): only the iphone jobs", () => {
    const result = e2eMatrix({
      event: pr,
      description: `[${coverageToken(noPhone, 24)}] passed`,
      ciNode: 24,
    });
    expect(result.entries).toEqual([
      { projects: "iphone", browsers: "webkit", build: "production" },
    ]);
  });

  it("runs exactly what the proof did not cover", () => {
    const result = e2eMatrix({
      event: pr,
      description: "[e2e production:chromium node24] passed",
      ciNode: 24,
    });
    expect(result.entries).toEqual([
      { projects: "android", browsers: "chromium", build: "production" },
      { projects: "iphone", browsers: "webkit", build: "production" },
    ]);
  });

  it("no proof, an unreadable one, a proof without e2e, or any other event: the full run", () => {
    for (const [event, description] of [
      [pr, undefined],
      [pr, ""],
      [pr, "passed in 9m12s: format, lint, types, knip"],
      [pr, "[e2e none] passed"],
      ["push", `[${coverageToken(all, 24)}] passed`],
      ["workflow_dispatch", `[${coverageToken(all, 24)}] passed`],
      [undefined, `[${coverageToken(all, 24)}] passed`],
    ] as const) {
      expect(e2eMatrix({ event, description, ciNode: 24 }).entries).toEqual(fullMatrix());
    }
  });

  it("only trusts a proof made on the Node major CI runs: any other, or none named, is the full run (CI16)", () => {
    for (const [description, ciNode] of [
      [`[${coverageToken(all, 26)}] passed`, 24],
      [`[${coverageToken(all, 24)}] passed`, 26],
      [`[${coverageToken(all)}] passed`, 24],
      [`[${coverageToken(all, 24)}] passed`, undefined],
    ] as const) {
      expect(e2eMatrix({ event: pr, description, ciNode }).entries).toEqual(fullMatrix());
    }
  });

  it("says why, for the job's log", () => {
    const ciNode = 24;
    expect(e2eMatrix({ event: "push", description: undefined, ciNode }).reason).toMatch(
      /not a pull request/,
    );
    expect(e2eMatrix({ event: pr, description: undefined, ciNode }).reason).toMatch(/no proof/i);
    expect(
      e2eMatrix({ event: pr, description: `[${coverageToken(all, 24)}] x`, ciNode }).reason,
    ).toMatch(/covered/);
    expect(
      e2eMatrix({ event: pr, description: `[${coverageToken(all, 26)}] x`, ciNode }).reason,
    ).toBe("the proof ran on Node 26, CI runs Node 24");
    expect(
      e2eMatrix({ event: pr, description: `[${coverageToken(all)}] x`, ciNode }).reason,
    ).toMatch(/does not say which Node/);
  });
});

describe("proofScope: whether the proof covers the pull request (CI17)", () => {
  const ok = (description: string, frontendAffected: string) =>
    proofScope({ description, frontendAffected, ciNode: 24 });

  it("a frontend change needs every project on the production build, on the repo's Node", () => {
    expect(ok(`[${coverageToken(all, 24)}] passed`, "true")).toEqual({
      ok: true,
      reason:
        "the frontend is affected, and the proof ran production:chromium,android,iphone node24",
    });
    const noWebKit = ok(`[${coverageToken(noPhone, 24)}] passed`, "true");
    expect(noWebKit.ok).toBe(false);
    expect(noWebKit.reason).toBe(
      "the frontend is affected, and the proof did not run e2e on production: iphone",
    );
    expect(ok("[e2e none node24] passed", "true").ok).toBe(false);
    expect(ok("[e2e production:chromium,android node24] passed", "true").ok).toBe(false);
  });

  it("a change that does not affect the frontend needs a proof on the repo's Node, e2e or not", () => {
    expect(ok("[e2e none node24] passed", "false")).toEqual({
      ok: true,
      reason: "the frontend is not affected; the proof ran none node24",
    });
    expect(ok(`[${coverageToken(all, 24)}] passed`, "false").ok).toBe(true);
  });

  it("fails on another Node, no Node named, no proof, or an unreadable one (CI16)", () => {
    const noNode = "the proof does not say which Node it ran on (the repo runs Node 24)";
    for (const [description, reason] of [
      ["[e2e none node26] passed", "the proof ran on Node 26, the repo runs Node 24"],
      ["[e2e none] passed", noNode],
      ["passed in 9m12s: format", noNode],
      ["", "no proof for this head"],
    ] as const) {
      expect(ok(description, "false")).toEqual({ ok: false, reason });
    }
    expect(proofScope({ description: undefined, frontendAffected: "false", ciNode: 24 }).ok).toBe(
      false,
    );
    expect(
      proofScope({
        description: "[e2e none node24] x",
        frontendAffected: "false",
        ciNode: undefined,
      }).reason,
    ).toMatch(/\.nvmrc/);
  });

  it("fails when what the change affects is unknown: the gate never guesses", () => {
    for (const frontendAffected of [undefined, "", "null", "yes"]) {
      const result = proofScope({
        description: `[${coverageToken(all, 24)}] passed`,
        frontendAffected,
        ciNode: 24,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/what the change affects is unknown/);
    }
  });
});
