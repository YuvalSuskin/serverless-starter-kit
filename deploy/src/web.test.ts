import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import {
  assetRoutes,
  buildId,
  installServerStart,
  SERVER_HANDLER,
  SERVER_START_FILE,
  serverCacheEnvironment,
  uploadCommand,
  webBuildEnvironment,
  webServerEnvironment,
} from "./web";

describe("webBuildEnvironment", () => {
  it("bakes the site's address into the build, and nothing else", () => {
    expect(webBuildEnvironment("https://dev.example.test")).toEqual({
      SITE_URL: "https://dev.example.test",
    });
  });
});

describe("webServerEnvironment", () => {
  it("hands the server the cache, the API it reaches directly, the origin secret and its own address", () => {
    expect(
      webServerEnvironment({
        apiOrigin: "https://api.example",
        bucket: "assets",
        originSecret: "s",
        region: "eu-west-1",
        siteUrl: "https://dev.example",
      }),
    ).toEqual({
      API_ORIGIN: "https://api.example",
      CACHE_BUCKET_KEY_PREFIX: "_cache",
      CACHE_BUCKET_NAME: "assets",
      CACHE_BUCKET_REGION: "eu-west-1",
      ORIGIN_SECRET: "s",
      SITE_URL: "https://dev.example",
    });
  });

  it("names the variables the frontend reads", () => {
    const instrumentation = readFileSync(
      new URL("../../frontend/src/instrumentation.ts", import.meta.url),
      "utf8",
    );
    expect(instrumentation).toContain("process.env.API_ORIGIN");
    expect(instrumentation).toContain("process.env.ORIGIN_SECRET");
    const turbo = readFileSync(new URL("../../turbo.json", import.meta.url), "utf8");
    expect(turbo).toContain('"SITE_URL"');
  });
});

function fakeBuild() {
  const dir = mkdtempSync(join(tmpdir(), "open-next-"));
  mkdirSync(join(dir, "assets", "_next", "static"), { recursive: true });
  mkdirSync(join(dir, "assets", "og"), { recursive: true });
  writeFileSync(join(dir, "assets", "BUILD_ID"), "abc123\n");
  writeFileSync(join(dir, "assets", "mockServiceWorker.js"), "");
  return dir;
}

describe("assetRoutes", () => {
  it("routes /_next and every public entry to the bucket, never BUILD_ID or MSW's worker", () => {
    expect(assetRoutes(fakeBuild())).toEqual(["/_next", "/og"]);
  });
});

describe("buildId", () => {
  it("is OpenNext's BUILD_ID, trimmed", () => {
    expect(buildId(fakeBuild())).toBe("abc123");
  });
});

describe("uploadCommand", () => {
  const command = uploadCommand("../frontend/.open-next", "the-bucket");

  it("caches hashed files for a year and keeps old ones (no --delete)", () => {
    expect(command).toContain(
      'aws s3 sync ../frontend/.open-next/assets/_next s3://the-bucket/_next --cache-control "public,max-age=31536000,immutable"',
    );
    expect(command).not.toContain("--delete");
    expect(command).toContain("--exclude mockServiceWorker.js");
  });

  it("puts prerendered pages where the incremental cache reads them", () => {
    expect(command).toContain("aws s3 sync ../frontend/.open-next/cache s3://the-bucket/_cache");
    expect(serverCacheEnvironment("the-bucket", "eu-west-1")).toEqual({
      CACHE_BUCKET_KEY_PREFIX: "_cache",
      CACHE_BUCKET_NAME: "the-bucket",
      CACHE_BUCKET_REGION: "eu-west-1",
    });
  });
});

// The site Lambda's entry wakes the API before OpenNext's server
// loads, so the two cold starts overlap, and the frontend's first server call
// waits for the same answer (frontend/src/lib/data/api-warm-up.ts).
describe("the site Lambda's entry", () => {
  it("is installed beside OpenNext's index.mjs, and is the Lambda's handler", () => {
    const bundle = mkdtempSync(join(tmpdir(), "server-"));
    installServerStart(bundle);
    expect(readFileSync(join(bundle, SERVER_START_FILE), "utf8")).toBe(
      readFileSync(new URL("../functions/web-server/start.mjs", import.meta.url), "utf8"),
    );
    expect(SERVER_HANDLER).toBe(`${SERVER_START_FILE.replace(/\.mjs$/, "")}.handler`);
  });

  it("shares its key with the frontend's warm-up", () => {
    const key = 'Symbol.for("acme.apiWarmUp")';
    expect(
      readFileSync(new URL("../functions/web-server/start.mjs", import.meta.url), "utf8"),
    ).toContain(key);
    expect(
      readFileSync(new URL("../../frontend/src/lib/data/api-warm-up.ts", import.meta.url), "utf8"),
    ).toContain(key);
  });

  // The fake index.mjs stands in for OpenNext's load: 300 ms that keep the
  // event loop busy, as requiring Next's server does.
  async function runEntry(environment: Record<string, string>) {
    const bundle = mkdtempSync(join(tmpdir(), "server-"));
    installServerStart(bundle);
    writeFileSync(
      join(bundle, "index.mjs"),
      [
        'export const handler = () => "opennext";',
        "export const loadingFrom = Date.now();",
        "while (Date.now() < loadingFrom + 300);",
      ].join("\n"),
    );
    writeFileSync(
      join(bundle, "run.mjs"),
      [
        `const { handler } = await import("./${SERVER_START_FILE}");`,
        'const { loadingFrom } = await import("./index.mjs");',
        'await globalThis[Symbol.for("acme.apiWarmUp")];',
        "console.log(JSON.stringify({ answer: handler(), loadingFrom }));",
      ].join("\n"),
    );
    const { stdout } = await promisify(execFile)(process.execPath, [join(bundle, "run.mjs")], {
      env: { ...process.env, ...environment },
    });
    return JSON.parse(stdout) as { answer: string; loadingFrom: number };
  }

  it("asks the API's health route, with the origin secret, before OpenNext loads", async () => {
    const seen: { arrivedAt?: number; path?: string; secret?: string } = {};
    const api = createServer((request, response) => {
      seen.arrivedAt = Date.now();
      seen.path = request.url;
      seen.secret = request.headers["x-origin-secret"] as string;
      response.end('{"status":"ok"}');
    });
    await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
    const { port } = api.address() as { port: number };
    try {
      const result = await runEntry({
        API_ORIGIN: `http://127.0.0.1:${String(port)}`,
        ORIGIN_SECRET: "secret-for-tests",
      });
      expect(result.answer).toBe("opennext");
      expect(seen).toMatchObject({ path: "/api/health", secret: "secret-for-tests" });
      // Sent before the load, not queued behind its 300 ms.
      expect(seen.arrivedAt).toBeLessThan(result.loadingFrom + 150);
    } finally {
      api.close();
    }
  });

  it("without an API, or with one that does not answer, hands over all the same", async () => {
    expect((await runEntry({ API_ORIGIN: "" })).answer).toBe("opennext");
    // Nothing listens on port 9 here: the warm-up fails, the entry does not.
    expect((await runEntry({ API_ORIGIN: "http://127.0.0.1:9" })).answer).toBe("opennext");
  });
});
