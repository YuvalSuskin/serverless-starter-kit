import path from "node:path";
import { describe, expect, it } from "vitest";

import { classify, resolveTarget } from "./targets.ts";
import { scriptedRunner, tempRepo } from "./testing.ts";

describe("classify", () => {
  it.each([
    [".", { kind: "current" }],
    ["#12", { kind: "pr", number: 12 }],
    ["https://github.com/o/r/pull/34", { kind: "pr", number: 34 }],
    ["acme-5ss.1", { id: "acme-5ss.1", kind: "bead" }],
    ["acme-0f3", { id: "acme-0f3", kind: "bead" }],
    ["fix-ui", { kind: "name", value: "fix-ui" }],
    ["claude/fix-ui-123abc", { kind: "name", value: "claude/fix-ui-123abc" }],
  ])("%s", (input, expected) => {
    expect(classify(input)).toEqual(expected);
  });
});

describe("classify with the repo's bead prefix", () => {
  it("takes the prefix it is given, and no other", () => {
    expect(classify("shop-5ss.1", "shop")).toEqual({ id: "shop-5ss.1", kind: "bead" });
    expect(classify("acme-5ss.1", "shop")).toEqual({ kind: "name", value: "acme-5ss.1" });
  });

  it("takes a hyphenated prefix whole", () => {
    expect(classify("my-shop-5ss.1", "my-shop")).toEqual({ id: "my-shop-5ss.1", kind: "bead" });
    expect(classify("my-shop-branch-name", "my-shop")).toEqual({
      kind: "name",
      value: "my-shop-branch-name",
    });
  });

  it("keeps a hyphenated branch name a name under the default prefix", () => {
    expect(classify("my-branch")).toEqual({ kind: "name", value: "my-branch" });
  });
});

describe("resolveTarget", () => {
  it("'.' is the current worktree, even on a detached HEAD", async () => {
    const repo = tempRepo();
    repo.git(["checkout", "--detach"]);
    const run = scriptedRunner({});
    expect(await resolveTarget(".", { cwd: repo.root, run })).toEqual({
      kind: "worktree",
      path: repo.root,
    });
  });

  it("finds a local branch, and a branch that only exists on origin", async () => {
    const repo = tempRepo();
    repo.git(["branch", "local-only"]);
    repo.git(["push", "origin", "main:remote-only"]);
    repo.git(["fetch", "origin"]);
    const ctx = { cwd: repo.root, run: scriptedRunner({}) };
    expect(await resolveTarget("local-only", ctx)).toEqual({
      bead: undefined,
      branch: "local-only",
      kind: "branch",
    });
    expect(await resolveTarget("remote-only", ctx)).toMatchObject({ branch: "remote-only" });
  });

  it("fetches a branch it does not know yet", async () => {
    const repo = tempRepo();
    repo.git(["push", "origin", "main:pushed-elsewhere"]);
    repo.git(["update-ref", "-d", "refs/remotes/origin/pushed-elsewhere"]);
    const ctx = { cwd: repo.root, run: scriptedRunner({}) };
    expect(await resolveTarget("pushed-elsewhere", ctx)).toMatchObject({
      branch: "pushed-elsewhere",
    });
  });

  it("matches a unique part of a worktree's folder name", async () => {
    const repo = tempRepo();
    const tree = path.join(repo.root, ".claude/worktrees/frontend-folder-structure-552205");
    repo.git(["worktree", "add", "-b", "claude/frontend-folder-structure-552205", tree]);
    const ctx = { cwd: repo.root, run: scriptedRunner({}) };
    expect(await resolveTarget("folder-structure", ctx)).toMatchObject({
      branch: "claude/frontend-folder-structure-552205",
    });
  });

  it("says what to do when nothing matches", async () => {
    const repo = tempRepo();
    const result = await resolveTarget("nothing-like-this", {
      cwd: repo.root,
      run: scriptedRunner({}),
    });
    expect(result).toMatchObject({ kind: "error" });
    expect(result.kind === "error" && result.message).toMatch(/pnpm preview list/);
  });

  it("resolves a PR through gh, and explains when gh is missing", async () => {
    const repo = tempRepo();
    const withGh = scriptedRunner({
      "gh pr view 12 --json headRefName": { stdout: '{"headRefName":"claude/x-111111"}' },
    });
    expect(await resolveTarget("#12", { cwd: repo.root, run: withGh })).toEqual({
      bead: undefined,
      branch: "claude/x-111111",
      kind: "branch",
    });
    const noGh = scriptedRunner({ "gh pr view 12 --json headRefName": { code: 127 } });
    const missing = await resolveTarget("#12", { cwd: repo.root, run: noGh });
    expect(missing.kind === "error" && missing.message).toMatch(/brew install gh/);
  });

  describe("beads", () => {
    const show = (id: string, bead: object) => ({
      [`bd show ${id} --json`]: { stdout: JSON.stringify([{ id, ...bead }]) },
    });

    it("reads the bead prefix from the repo's beads config", async () => {
      const repo = tempRepo();
      repo.commit(".beads/config.yaml", 'issue-prefix: "my-shop"\n', "beads config");
      const run = scriptedRunner(show("my-shop-abc", { metadata: { branch: "claude/a-111111" } }));
      expect(await resolveTarget("my-shop-abc", { cwd: repo.root, run })).toEqual({
        bead: "my-shop-abc",
        branch: "claude/a-111111",
        kind: "branch",
      });
    });

    it("uses the branch recorded on the bead", async () => {
      const repo = tempRepo();
      const run = scriptedRunner(show("acme-abc", { metadata: { branch: "claude/a-111111" } }));
      expect(await resolveTarget("acme-abc", { cwd: repo.root, run })).toEqual({
        bead: "acme-abc",
        branch: "claude/a-111111",
        kind: "branch",
      });
    });

    it("falls back to the bead's PR (external-ref gh-<n>)", async () => {
      const repo = tempRepo();
      const run = scriptedRunner({
        ...show("acme-abc", { external_ref: "gh-7" }),
        "gh pr view 7 --json headRefName": { stdout: '{"headRefName":"claude/b-222222"}' },
      });
      expect(await resolveTarget("acme-abc", { cwd: repo.root, run })).toEqual({
        bead: "acme-abc",
        branch: "claude/b-222222",
        kind: "branch",
      });
    });

    it("falls back to the one branch whose commits mention the bead", async () => {
      const repo = tempRepo();
      repo.git(["checkout", "-b", "claude/c-333333"]);
      repo.commit("c.txt", "c\n", "Implement acme-abc");
      repo.git(["checkout", "main"]);
      const run = scriptedRunner(show("acme-abc", {}));
      expect(await resolveTarget("acme-abc", { cwd: repo.root, run })).toMatchObject({
        branch: "claude/c-333333",
      });
    });

    it("lists the candidates when several branches mention the bead", async () => {
      const repo = tempRepo();
      for (const branch of ["claude/d-444444", "claude/e-555555"]) {
        repo.git(["checkout", "-b", branch, "main"]);
        repo.commit(`${branch}.txt`, "x\n", "Part of acme-abc");
      }
      repo.git(["checkout", "main"]);
      const run = scriptedRunner(show("acme-abc", {}));
      const result = await resolveTarget("acme-abc", { cwd: repo.root, run });
      expect(result).toMatchObject({ kind: "error" });
      expect(result.kind === "error" && result.message).toMatch(
        /claude\/d-444444[\s\S]*claude\/e-555555/,
      );
    });

    it("lists an epic's children that have branches", async () => {
      const repo = tempRepo();
      const run = scriptedRunner({
        ...show("acme-epc", { issue_type: "epic" }),
        "bd list --parent acme-epc --all --has-metadata-key branch --json": {
          stdout: JSON.stringify([{ id: "acme-epc.1", title: "Uploader" }]),
        },
      });
      const result = await resolveTarget("acme-epc", { cwd: repo.root, run });
      expect(result.kind === "error" && result.message).toMatch(/acme-epc\.1\s+Uploader/);
    });

    it("treats an id bd does not know as a branch or worktree name", async () => {
      const repo = tempRepo();
      repo.git(["branch", "Release-abc"]);
      const run = scriptedRunner({ "bd show Release-abc --json": { code: 1 } });
      expect(await resolveTarget("Release-abc", { cwd: repo.root, run })).toMatchObject({
        branch: "Release-abc",
      });
    });
  });
});
