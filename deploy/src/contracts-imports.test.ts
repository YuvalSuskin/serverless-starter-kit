// deploy/'s scripts run straight under Node (`node scripts/smoke.ts`), which
// resolves imports without a bundler: `@acme/contracts/client` composes
// the audience tables through extensionless relative imports, so Node cannot
// load it (the dev smoke broke that way after T0, PR #133). The headers and
// path helpers deploy/ needs live in `@acme/contracts/client/core`, which
// imports nothing.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOTS = ["../scripts/", "./"].map((dir) => new URL(dir, import.meta.url));

function sources(root: URL): { file: string; text: string }[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({ file, text: readFileSync(new URL(file, root), "utf8") }));
}

describe("deploy/ imports from the contracts", () => {
  it("never imports @acme/contracts/client itself, only its route-free core", () => {
    const offenders = ROOTS.flatMap(sources)
      .filter(({ text }) => /from\s+["']@acme\/contracts\/client["']/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
