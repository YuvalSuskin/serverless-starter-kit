// Tests the ARTIFACT, not the source: dist/api.mjs as built by
// `pnpm build`, which is what gets deployed. Run with `pnpm test:bundle`;
// turbo builds first.
import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from "aws-lambda";

import { globSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const backend = path.join(import.meta.dirname, "../..");
const dist = path.join(backend, "dist");
interface Meta {
  inputs: Record<string, unknown>;
  outputs: Record<
    string,
    { bytes: number; imports: { kind: string; path: string }[]; inputs: Record<string, unknown> }
  >;
}
// meta.json is the API's build: api.mjs and its chunks.
const meta = () => JSON.parse(readFileSync(path.join(dist, "meta.json"), "utf8")) as Meta;
const inputs = () => Object.keys(meta().inputs);

// What a cold start loads: api.mjs and every chunk it imports
// statically, through its chunks' own static imports.
function coldStartFiles(): string[] {
  const { outputs } = meta();
  const files = new Set<string>();
  const visit = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    for (const { kind, path: imported } of outputs[file]?.imports ?? []) {
      if (kind === "import-statement" && imported in outputs) visit(imported);
    }
  };
  visit("dist/api.mjs");
  return [...files];
}

// Measured with every real adapter wired (DynamoDB, SES and Powertools) and
// each dependency's ES module build: 389 KB loaded by a cold start and 637 KB
// in all, plus about 25% headroom. Cold starts grow
// with bundle size: raising this is a deliberate, reviewed change, never a way
// to make the build pass. The bundle is split: this budget is
// what a cold start loads, api.mjs and the chunks it imports statically; what
// only loads on first use (SES, the SDK's other credential providers) is in
// chunks of its own, and the whole bundle has TOTAL_BUDGET_BYTES.
const BUDGET_BYTES = 490 * 1024;
const TOTAL_BUDGET_BYTES = 800 * 1024;

type Handler = (event: APIGatewayProxyEventV2, context: object) => Promise<APIGatewayProxyResult>;
let handler: Handler;

beforeAll(async () => {
  // The Lambda's environment: config fails fast without it.
  Object.assign(process.env, {
    AWS_REGION: "us-east-1",
    // A stage whose email is on: its settings parse
    // at cold start and the SES mailer is wired.
    EMAIL: "on",
    EMAIL_FROM: "no-reply@bundle-test.example.test",
    EMAIL_NOTICES_CONFIGURATION_SET: "acme-bundle-test-notices",
    EMAIL_SITE_URL: "https://bundle-test.example.test",
    EMAIL_TEAM_ADDRESS: "hello@example.test",
    EMAIL_TEAM_CONFIGURATION_SET: "acme-bundle-test-team",
    STAGE: "bundle-test",
    TABLE_NAME: "acme",
  });
  ({ handler } = (await import(path.join(dist, "api.mjs"))) as { handler: Handler });
});

const event = (method: string, rawPath: string): APIGatewayProxyEventV2 => ({
  headers: {},
  isBase64Encoded: false,
  rawPath,
  rawQueryString: "",
  requestContext: {
    accountId: "123456789012",
    apiId: "api",
    domainName: "example.com",
    domainPrefix: "example",
    http: {
      method,
      path: rawPath,
      protocol: "HTTP/1.1",
      sourceIp: "127.0.0.1",
      userAgent: "vitest",
    },
    requestId: "request",
    routeKey: "$default",
    stage: "$default",
    time: "01/Jan/2026:00:00:00 +0000",
    timeEpoch: 0,
  },
  routeKey: "$default",
  version: "2.0",
});

describe("dist/api.mjs", () => {
  it("answers GET /api/health as a Lambda", async () => {
    const response = await handler(event("GET", "/api/health"), {});
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "ok" });
  });

  it("answers a path no route has with 404 not_found, as the app does", async () => {
    const response = await handler(event("GET", "/api/nope"), {});
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toMatchObject({ code: "not_found" });
  });

  it("refuses a body that is not JSON with 415, before the route reaches DynamoDB", async () => {
    const response = await handler(
      {
        ...event("POST", "/api/public/messages"),
        body: "hello",
        headers: { "content-type": "text/plain" },
      },
      {},
    );
    expect(response.statusCode).toBe(415);
  });

  it("contains no fake and no dev-server code", () => {
    expect(inputs().length).toBeGreaterThan(0);
    expect(inputs().filter((input) => /src\/(fakes|entries\/dev)\//.test(input))).toEqual([]);
  });

  // The size budget and the bundling of each SDK mean something only if
  // everything production will run is in the bundle.
  it("wires every real adapter", () => {
    // The table's definition is for the tests and the infrastructure: the
    // Lambda never creates a table.
    const notRuntime = ["src/adapters/dynamodb/table.ts"];
    const adapters = globSync("src/adapters/**/*.ts", { cwd: backend }).filter(
      (file) => !file.endsWith(".test.ts") && !notRuntime.includes(file),
    );
    expect(adapters.length).toBeGreaterThan(0);
    expect(adapters.filter((adapter) => !inputs().includes(adapter))).toEqual([]);
  });

  // A native library loads a binary per platform: the API must stay
  // deployable without one, so any that arrives is a reviewed change (it
  // ships beside the bundle, installed for the Lambda's platform).
  it("carries no native library", () => {
    expect(inputs().filter((input) => input.endsWith(".node"))).toEqual([]);
  });

  // esbuild's default for platform "node" takes a package's CommonJS build
  // ("main") before its ES module build ("module"), and CommonJS does not
  // tree-shake.
  it("takes the ES module build of every dependency that ships one", () => {
    const commonJs = inputs().filter((input) => input.includes("/dist-cjs/"));
    const withModule = commonJs.filter((input) => {
      const pkg = input.slice(0, input.indexOf("/dist-cjs/"));
      const manifest = JSON.parse(
        readFileSync(path.join(backend, pkg, "package.json"), "utf8"),
      ) as { module?: string };
      return manifest.module !== undefined;
    });
    expect(withModule).toEqual([]);
  });

  it(`CS3: a cold start loads at most ${(BUDGET_BYTES / 1024).toString()} KB`, () => {
    const files = coldStartFiles();
    expect(files.length).toBeGreaterThan(1);
    const bytes = files.reduce((sum, file) => sum + statSync(path.join(backend, file)).size, 0);
    expect(bytes).toBeLessThanOrEqual(BUDGET_BYTES);
  });

  it(`stays within its whole size budget (${(TOTAL_BUDGET_BYTES / 1024).toString()} KB)`, () => {
    const code = Object.keys(meta().outputs).filter((file) => file.endsWith(".mjs"));
    const bytes = code.reduce((sum, file) => sum + statSync(path.join(backend, file)).size, 0);
    expect(bytes).toBeLessThanOrEqual(TOTAL_BUDGET_BYTES);
  });

  // SES (an owner's mail) is loaded by the first request that needs it.
  it("a cold start loads no SES, which the bundle still carries", () => {
    const { outputs } = meta();
    const loaded = coldStartFiles().flatMap((file) => Object.keys(outputs[file]?.inputs ?? {}));
    expect(loaded.filter((input) => input.includes("node_modules/@aws-sdk/client-sesv2/"))).toEqual(
      [],
    );
    expect(inputs().some((input) => input.includes("@aws-sdk/client-sesv2/"))).toBe(true);
  });
});
