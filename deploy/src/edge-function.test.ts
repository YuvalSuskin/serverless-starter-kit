// The whole viewer-request function CloudFront runs (decision S20): SST's router code around our injection, rebuilt here from SST's own
// source in .sst/platform (`pnpm typegen`) the way its Router assembles it,
// then compacted as sst.config.ts deploys it. CloudFront refuses a function
// over 10,240 bytes; on 2026-10-19 dev's measured 9,854 uncompacted, and this
// rebuild of dev's gave the same 9,854.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { basicAuthHeader, compactFunctionCode, viewerRequestInjection } from "./edge";
import { stageSettings } from "./stage";

/** CloudFront's limit on a function's code, less 1 KB for SST upgrades and the next rule. */
const BUDGET = 10_240 - 1_024;
// The runbook's lengths: `openssl rand -hex 32` and 32 letters and digits.
const SECRET = "a".repeat(64);
const PASSWORD = "p".repeat(32);

const PLATFORM = path.join(import.meta.dirname, "../.sst/platform");
const ROUTER = path.join(PLATFORM, "src/components/aws/router.ts");

type Template = (...values: unknown[]) => string;

function grab(source: string, pattern: RegExp): string {
  const found = pattern.exec(source)?.[1];
  if (found === undefined) throw new Error(`SST's router.ts changed: ${String(pattern)} not found`);
  return found;
}

function template(tag: string, body: string, ...names: string[]): Template {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, sonarjs/code-eval -- SST's own template literals, from its source
  return new Function(...names, `return ${tag}\`${body}\`;`) as Template;
}

/** The router's KeyValueStore namespace (SST's buildRequestKvNamespace). */
function namespaceOf(stage: string): string {
  return createHash("md5").update(`acme-${stage}-Cdn`).digest("hex").slice(0, 4);
}

/** SST's Router's createRequestFunction: the code it hands CloudFront for this stage. */
async function sstRequestFunction(stage: string, injection: string, domain: boolean) {
  if (!existsSync(ROUTER)) throw new Error("SST's platform code is missing: run `pnpm typegen`");
  const source = readFileSync(ROUTER, "utf8");
  // SST minifies its routing helpers with its own esbuild as the module loads.
  const minifyModule = pathToFileURL(path.join(PLATFORM, "src/util/minify.ts")).href;
  const { minify } = (await import(minifyModule)) as { minify: Template };
  const limit = grab(source, /const CLOUDFRONT_FUNCTION_SAFE_HEADER_LIMIT = (\d+) - (?:\d+);/);
  const reserve = grab(source, /const CLOUDFRONT_FUNCTION_SAFE_HEADER_LIMIT = \d+ - (\d+);/);
  const router = template(
    "minify",
    grab(source, /export const CF_ROUTER_INJECTION = minify`([\s\S]*?)`;\n/),
    "minify",
    "CLOUDFRONT_FUNCTION_SAFE_HEADER_LIMIT",
  )(minify, Number(limit) - Number(reserve));
  const block = grab(source, /export const CF_BLOCK_CLOUDFRONT_URL_INJECTION = `([\s\S]*?)`;/);
  const code = grab(
    source.slice(source.indexOf("function createRequestFunction()")),
    /code: interpolate`([\s\S]*?)`,\n\s*\},\n\s*\{ parent: self \}/,
  );
  return template(
    "",
    code,
    "userInjection",
    "blockCloudfrontUrlInjection",
    "CF_ROUTER_INJECTION",
    "kvNamespace",
  )(injection, domain ? block : "", router, namespaceOf(stage));
}

interface Stage {
  basicAuth: boolean;
  domain: boolean;
  stage: string;
}

function settingsOf(stage: string): Stage {
  const settings = stageSettings(stage);
  return {
    basicAuth: settings.basicAuth,
    domain: settings.domain !== undefined,
    stage,
  };
}

const LARGEST: Stage = { ...settingsOf("dev"), domain: true };
const STAGES: [string, Stage][] = [
  ["dev", settingsOf("dev")],
  ["production", settingsOf("production")],
  ["a throwaway stage", settingsOf("e6w2")],
  // The largest: basic auth and SST's cloudfront.net block.
  ["dev once it is on a domain", LARGEST],
];

async function built({ basicAuth, domain, stage }: Stage) {
  const injection = viewerRequestInjection({
    basicAuthPassword: basicAuth ? PASSWORD : undefined,
    originSecret: SECRET,
  });
  const raw = await sstRequestFunction(stage, injection, domain);
  return { compact: await compactFunctionCode(raw), raw };
}

describe("the viewer-request function CloudFront runs", () => {
  it.each(STAGES)(
    "S20: %s's fits CloudFront's 10,240 bytes with 1 KB to spare",
    async (_, stage) => {
      const { compact, raw } = await built(stage);
      expect(raw).toContain("async function handler(event)");
      expect(raw).toContain(
        viewerRequestInjection({
          basicAuthPassword: stage.basicAuth ? PASSWORD : undefined,
          originSecret: SECRET,
        }),
      );
      expect(Buffer.byteLength(compact)).toBeLessThanOrEqual(BUDGET);
    },
  );

  it("S20: answers every request the same compacted as written, every gate included", async () => {
    const { compact, raw } = await built(LARGEST);
    const signedIn = { authorization: basicAuthHeader(PASSWORD) };
    const visits: [string, Visit, Outcome][] = [
      ["no password", { uri: "/contact" }, 401],
      [
        "a wrong password",
        { headers: { authorization: basicAuthHeader("q".repeat(32)) }, uri: "/" },
        401,
      ],
      ["a page", { headers: signedIn, uri: "/contact" }, "web"],
      ["a page's RSC payload", { headers: { ...signedIn, rsc: "1" }, uri: "/contact" }, "web"],
      ["the API", { headers: signedIn, uri: "/api/health" }, "api"],
      [
        "an API path through an encoded ..",
        { headers: signedIn, uri: "/api/public/messages/..%2f..%2fhealth" },
        400,
      ],
      [
        "an API path with a query",
        { headers: signedIn, query: { limit: "20" }, uri: "/api/public/messages" },
        "api",
      ],
      [
        "the cloudfront.net address",
        { headers: { ...signedIn, host: "d1.cloudfront.net" }, uri: "/" },
        403,
      ],
    ];
    const outcomes: Record<string, Outcome | undefined> = {};
    for (const [name, visit] of visits) {
      const written = await visitWith(raw, LARGEST.stage, visit);
      const compacted = await visitWith(compact, LARGEST.stage, visit);
      expect({ name, ...compacted }).toEqual({ name, ...written });
      outcomes[name] = compacted.outcome;
    }
    expect(outcomes).toEqual(
      Object.fromEntries(visits.map(([name, , outcome]) => [name, outcome])),
    );
  });

  it("S20: keeps the handler's name and the cloudfront module, which CloudFront looks for", async () => {
    const compact = await compactFunctionCode(
      `import cf from "cloudfront";\nasync function handler(event) {\n  var unused = cf;\n  return event.request;\n}`,
    );
    expect(compact).toMatch(/^import cf from"cloudfront";async function handler\(\w+\)\{/);
  });

  it("S20: never puts the code in its error: the code holds the origin secret", async () => {
    const error: unknown = await compactFunctionCode(
      `async function handler(event) { "${SECRET}" ${SECRET} (`,
    ).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(SECRET);
    expect(JSON.stringify(error)).not.toContain(SECRET);
  });
});

interface Visit {
  headers?: Record<string, string>;
  query?: Record<string, string>;
  uri: string;
}
type Outcome = number | keyof typeof ROUTES;
type Handler = (event: unknown) => Promise<Record<string, unknown>>;

const ROUTES = {
  api: { domain: "api.example", path: "/api" },
  web: { domain: "web.example", path: "/" },
} as const;

/**
 * Runs the function as CloudFront would, with the router's routes in a
 * stand-in KeyValueStore: the site at / and the API at /api. The outcome is the refusal's status, or the origin it chose.
 */
async function visitWith(code: string, stage: string, { headers = {}, query = {}, uri }: Visit) {
  const store = new Map<string, string>();
  const routes = Object.entries(ROUTES).map(([name, route]) => {
    store.set(`${name}:metadata`, JSON.stringify({ host: route.domain }));
    return `url,${name},,${route.path}`;
  });
  store.set(`${namespaceOf(stage)}:routes`, JSON.stringify(routes));
  let origin: Outcome | undefined;
  const cf = {
    kvs: () => ({
      get: (key: string) => {
        const value = store.get(key);
        return value === undefined ? Promise.reject(new Error("no key")) : Promise.resolve(value);
      },
    }),
    updateRequestOrigin: ({ domainName }: { domainName: string }) => {
      origin = (Object.keys(ROUTES) as (keyof typeof ROUTES)[]).find(
        (name) => ROUTES[name].domain === domainName,
      );
    },
  };
  const module = /^\s*import (\w+) ?from ?"cloudfront";/.exec(code);
  if (!module?.[1]) throw new Error("The function does not import the cloudfront module");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, sonarjs/code-eval -- the code under test is a CloudFront Function's source
  const load = new Function(
    module[1],
    "require",
    `"use strict";${code.slice(module[0].length)}\nreturn handler;`,
  ) as (cloudfront: typeof cf, load: NodeJS.Require) => Handler;
  const handler = load(cf, createRequire(import.meta.url));
  const result = await handler({
    request: {
      cookies: {},
      headers: Object.fromEntries(
        Object.entries({ host: "dev.example.test", ...headers }).map(([k, v]) => [k, { value: v }]),
      ),
      method: "GET",
      querystring: Object.fromEntries(Object.entries(query).map(([k, v]) => [k, { value: v }])),
      uri,
    },
    viewer: { ip: "203.0.113.7" },
  });
  const status = result.statusCode as number | undefined;
  return { outcome: status ?? origin, result };
}
