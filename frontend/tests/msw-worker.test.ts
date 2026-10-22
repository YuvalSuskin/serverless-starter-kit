// public/mockServiceWorker.js is a copy of the worker that ships inside msw.
// msw's install script would refresh it, but install scripts do not run here
// (pnpm-workspace.yaml), so an msw upgrade leaves the old copy behind, and
// msw then warns in every browser test, or breaks. Refresh it with
// `pnpm exec msw init public` when this fails.
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const frontend = path.join(import.meta.dirname, "..");

it("public/mockServiceWorker.js matches the installed msw", () => {
  const worker = readFileSync(path.join(frontend, "public/mockServiceWorker.js"), "utf8");
  const installed = JSON.parse(
    readFileSync(path.join(frontend, "node_modules/msw/package.json"), "utf8"),
  ) as { version: string };
  expect(/PACKAGE_VERSION = "([^"]+)"/.exec(worker)?.[1]).toBe(installed.version);
});
