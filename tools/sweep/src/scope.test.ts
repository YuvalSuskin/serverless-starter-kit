import { expect, it } from "vitest";

import { classify, liveFiles } from "./scope.ts";
import { tempRepo } from "./testing.ts";

it("puts competitor data and generated brand files out of scope", () => {
  for (const file of [
    "docs/competitors/evenzza/profile.md",
    "design/fonts/Acme.woff2",
    "design/logo/mark.svg",
    "design/tokens/tokens.css",
    "docs/sweeps/ledger.jsonl",
    "pnpm-lock.yaml",
    ".superpowers/sweep/cache/stage/docs/a.md",
  ]) {
    expect(classify(file)).toBe("out");
  }
});

it("treats the archive and the review-batch records as history", () => {
  expect(classify("docs/archive/superpowers/plans/p.md")).toBe("archive");
  expect(classify("docs/reviews/batch-1/acme-xq7.md")).toBe("archive");
});

it("treats decisions, specs, CLAUDE.md files, skills and code as live", () => {
  for (const file of [
    "docs/decisions/2026-09-25-backend-decisions.md",
    "docs/product/sign-in.md",
    "frontend/CLAUDE.md",
    "design/DESIGN.md",
    ".claude/skills/review-batch/SKILL.md",
    ".claude/agents/design-researcher.md",
    "backend/src/api/app.ts",
    "tools/sweep/src/cli.ts",
  ]) {
    expect(classify(file)).toBe("live");
  }
});

it("lists only the repo's live files, never ignored ones", () => {
  const root = tempRepo({
    "docs/decisions/d.md": "x",
    "docs/archive/a.md": "x",
    "docs/competitors/c.md": "x",
    ".gitignore": ".superpowers/\n",
    ".superpowers/sweep/run/x.md": "x",
  });
  expect(liveFiles(root)).toEqual(["docs/decisions/d.md"]);
});
