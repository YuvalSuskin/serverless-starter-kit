import { expect, it } from "vitest";

import { brokenLinks, findLinks, resolveLink } from "./links.ts";
import { tempRepo } from "./testing.ts";

it("finds inline links and keeps the anchor in the target", () => {
  const found = findLinks("See [the spec](../specs/a.md#goal) and ![logo](logo.svg).");
  expect(found.map((link) => link.target)).toEqual(["../specs/a.md#goal", "logo.svg"]);
});

it("reports each target's position so it can be rewritten in place", () => {
  const text = "Read [a](x.md) now.";
  const [link] = findLinks(text);
  expect(link && text.slice(link.index, link.index + link.length)).toBe("x.md");
});

it("skips links inside fenced code and inline code", () => {
  const text = [
    "Real [one](a.md).",
    "```md",
    "[fenced](b.md)",
    "```",
    "~~~",
    "[tilde](c.md)",
    "~~~",
    "Inline `[code](d.md)` too.",
  ].join("\n");
  expect(findLinks(text).map((link) => link.target)).toEqual(["a.md"]);
});

it("resolves relative and root-relative links to repo paths", () => {
  expect(resolveLink("docs/plans/p.md", "../specs/s.md#x")).toBe("docs/specs/s.md");
  expect(resolveLink("docs/plans/p.md", "/CLAUDE.md")).toBe("CLAUDE.md");
  expect(resolveLink("README.md", "docs/")).toBe("docs");
});

it("returns null for external, anchor-only and placeholder links", () => {
  for (const target of ["https://x.dev", "mailto:a@b.c", "#goal", "<link>", "{{URL}}"]) {
    expect(resolveLink("docs/a.md", target)).toBeNull();
  }
});

it("finds a link whose target is missing, and accepts one into the archive that exists", () => {
  const root = tempRepo({
    "docs/decisions/d.md": "[gone](../product/missing.md) [old](../archive/plans/p.md)",
    "docs/archive/plans/p.md": "# Old plan",
  });
  expect(brokenLinks(root)).toEqual([
    { file: "docs/decisions/d.md", target: "../product/missing.md" },
  ]);
});

it("checks links inside the archive, and not inside out-of-scope folders", () => {
  const root = tempRepo({
    "docs/archive/plans/p.md": "[gone](nowhere.md)",
    "docs/competitors/x/profile.md": "[gone](nowhere.md)",
  });
  expect(brokenLinks(root).map((broken) => broken.file)).toEqual(["docs/archive/plans/p.md"]);
});

it("keeps parentheses inside a target, as in Next.js route groups", () => {
  const text = "See [home](../frontend/src/app/(marketing)/page.tsx) now.";
  expect(findLinks(text).map((link) => link.target)).toEqual([
    "../frontend/src/app/(marketing)/page.tsx",
  ]);
});
