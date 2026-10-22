import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { findSerpApiKey } from "./secrets.ts";

function roots(checkout?: string, main?: string) {
  const base = mkdtempSync(path.join(tmpdir(), "competitors-secrets-"));
  const make = (name: string, body?: string) => {
    const dir = path.join(base, name);
    mkdirSync(dir);
    if (body !== undefined) writeFileSync(path.join(dir, ".env.local"), body);
    return dir;
  };
  return { checkout: make("checkout", checkout), main: make("main", main) };
}

describe("findSerpApiKey", () => {
  it("takes the environment first", () => {
    const { checkout, main } = roots(
      "SERPAPI_API_KEY=from-checkout\n",
      "SERPAPI_API_KEY=from-main\n",
    );
    expect(findSerpApiKey({ SERPAPI_API_KEY: "from-env" }, checkout, main)).toBe("from-env");
  });

  it("then the checkout's .env.local, then the main checkout's", () => {
    const both = roots("# local\nSERPAPI_API_KEY=from-checkout\n", "SERPAPI_API_KEY=from-main\n");
    expect(findSerpApiKey({}, both.checkout, both.main)).toBe("from-checkout");
    const mainOnly = roots(undefined, "OTHER=1\nSERPAPI_API_KEY= from-main \n");
    expect(findSerpApiKey({}, mainOnly.checkout, mainOnly.main)).toBe("from-main");
  });

  it("reads quoted values and export lines, as dotenv files often have them", () => {
    const quoted = roots('SERPAPI_API_KEY="abc123"\n');
    expect(findSerpApiKey({}, quoted.checkout, quoted.main)).toBe("abc123");
    const exported = roots("export SERPAPI_API_KEY='def456'\n");
    expect(findSerpApiKey({}, exported.checkout, exported.main)).toBe("def456");
  });

  it("finds nothing when no file holds a non-empty key", () => {
    const { checkout, main } = roots("SERPAPI_API_KEY=\n");
    expect(findSerpApiKey({}, checkout, main)).toBeUndefined();
  });
});
