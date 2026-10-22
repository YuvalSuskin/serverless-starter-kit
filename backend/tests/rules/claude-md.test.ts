// backend/CLAUDE.md is how every future session learns these rules, and
// agents trust it. A doc that names a script or a file that does not exist is
// worse than no doc, so this keeps it true: rename a folder
// without updating the doc, and check fails.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const backend = path.join(import.meta.dirname, "../..");
const repo = path.join(backend, "..");
const doc = readFileSync(path.join(backend, "CLAUDE.md"), "utf8");
const scriptsOf = (dir: string) =>
  Object.keys(
    (JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { scripts: object })
      .scripts,
  );
const scripts = scriptsOf(backend);
// The doc says every command works "from the repo root and from backend/".
const rootScripts = scriptsOf(repo);

// Every line of every fenced block, then every `...` span outside them.
// Placeholders (<port>) and globs (*) are not paths.
const fenced = [...doc.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].flatMap((match) =>
  (match[1] ?? "").split("\n"),
);
const prose = doc.replace(/^```[^\n]*\n[\s\S]*?^```/gm, "");
const spans = [...prose.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] ?? "");
const concrete = (value: string) => !/[<>*]/.test(value);

// The layer folders, which the doc names without src/ (`platform/config.ts`).
const LAYERS = /^(adapters|api|authz|domain|entries|fakes|platform|workers)\//;

it("names only pnpm scripts that exist", () => {
  const named = [...spans, ...fenced].flatMap((span) =>
    [...span.matchAll(/\bpnpm ([\w:]+)/g)].map((m) => m[1] ?? ""),
  );
  expect(fenced.length).toBeGreaterThan(0);
  expect(named.length).toBeGreaterThan(0);
  expect(named.filter((name) => !scripts.includes(name))).toEqual([]);
  expect(named.filter((name) => !rootScripts.includes(name))).toEqual([]);
});

it("names only backend paths that exist", () => {
  const paths = spans.filter((span) => /^(src|tests)\//.test(span) && concrete(span));
  expect(paths.length).toBeGreaterThan(0);
  expect(paths.filter((p) => !existsSync(path.join(backend, p.replace(/\/$/, ""))))).toEqual([]);
});

it("names only layer paths that exist, when it leaves out src/", () => {
  const paths = spans.filter((span) => LAYERS.test(span) && concrete(span));
  expect(paths.length).toBeGreaterThan(0);
  expect(paths.filter((p) => !existsSync(path.join(backend, "src", p.replace(/\/$/, ""))))).toEqual(
    [],
  );
});

it("names only repo paths that exist", () => {
  const paths = spans.filter((span) => /^(docs|packages)\//.test(span) && concrete(span));
  expect(paths.filter((p) => !existsSync(path.join(repo, p)))).toEqual([]);
});
