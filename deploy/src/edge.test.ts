import { ORIGIN_SECRET_HEADER, VIEWER_ADDRESS_HEADER } from "@acme/contracts/client/core";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { basicAuthHeader, CACHE_KEY_HEADER, viewerRequestInjection } from "./edge";

const PASSWORD = "p".repeat(32);
const SECRET = "s".repeat(40);

interface Header {
  value: string;
}
interface Request {
  headers: Record<string, Header | undefined>;
  querystring: Record<string, { value: string }>;
  uri: string;
}
interface Response {
  headers: Record<string, Header>;
  statusCode: number;
}

// Runs the injection the way the router's function does: at the start of
// its handler, which then returns the (modified) request.
async function run(
  injection: string,
  headers: Record<string, string>,
  uri = "/contact",
  querystring: Record<string, { value: string }> = {},
) {
  const event = {
    request: {
      headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, { value: v }])),
      querystring,
      uri,
    } satisfies Request,
    viewer: { ip: "203.0.113.7" },
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, sonarjs/code-eval -- the code under test is a CloudFront Function's source
  const handler = new Function(
    "event",
    "require",
    `return (async () => { ${injection}\n return event.request; })();`,
  ) as (e: typeof event, r: typeof require) => Promise<Request | Response>;
  // CloudFront Functions offer require("crypto") with createHash.
  return handler(event, createRequire(import.meta.url));
}

describe("viewerRequestInjection with basic auth", () => {
  const injection = viewerRequestInjection({ basicAuthPassword: PASSWORD, originSecret: SECRET });

  it("asks for credentials when none are sent", async () => {
    const result = (await run(injection, {})) as Response;
    expect(result.statusCode).toBe(401);
    expect(result.headers["www-authenticate"]?.value).toMatch(/^Basic realm=/);
    expect(result.headers["cache-control"]?.value).toBe("no-store");
  });

  it("refuses a wrong password", async () => {
    const wrong = basicAuthHeader("q".repeat(32));
    expect(((await run(injection, { authorization: wrong })) as Response).statusCode).toBe(401);
  });

  it("refuses a different scheme", async () => {
    const bearer = { authorization: `Bearer ${PASSWORD}` };
    expect(((await run(injection, bearer)) as Response).statusCode).toBe(401);
  });

  it("asks for credentials on every path, the API's included", async () => {
    for (const uri of ["/", "/contact", "/api/health", "/_next/static/a.js"]) {
      expect(((await run(injection, {}, uri)) as Response).statusCode).toBe(401);
    }
  });

  it("lets the right password through and removes it before the origin", async () => {
    const result = (await run(injection, { authorization: basicAuthHeader(PASSWORD) })) as Request;
    expect(result.uri).toBe("/contact");
    expect(result.headers.authorization).toBeUndefined();
  });
});

describe("viewerRequestInjection headers", () => {
  const injection = viewerRequestInjection({ basicAuthPassword: undefined, originSecret: SECRET });

  it("lets every request through without basic auth (production)", async () => {
    const result = (await run(injection, {})) as Request;
    expect(result.uri).toBe("/contact");
  });

  it("overwrites a caller's own origin secret and viewer address", async () => {
    const result = (await run(injection, {
      [ORIGIN_SECRET_HEADER]: "forged",
      [VIEWER_ADDRESS_HEADER]: "198.51.100.1",
    })) as Request;
    expect(result.headers[ORIGIN_SECRET_HEADER]?.value).toBe(SECRET);
    expect(result.headers[VIEWER_ADDRESS_HEADER]?.value).toBe("203.0.113.7:0");
  });

  it("passes the visitor's host on, for the URLs the server builds", async () => {
    const result = (await run(injection, { host: "dev.example.test" })) as Request;
    expect(result.headers["x-forwarded-host"]?.value).toBe("dev.example.test");
  });

  it("keys the cache apart for an RSC payload and the HTML of the same URL", async () => {
    const html = (await run(injection, {})) as Request;
    const again = (await run(injection, {})) as Request;
    const rsc = (await run(injection, { rsc: "1" })) as Request;
    const key = (r: Request) => r.headers[CACHE_KEY_HEADER]?.value;
    expect(key(html)).toMatch(/^[0-9a-f]{32}$/);
    expect(key(again)).toBe(key(html));
    expect(key(rsc)).not.toBe(key(html));
  });

  it("refuses an origin secret CloudFront could not send as a header (a trailing newline)", () => {
    expect(() =>
      viewerRequestInjection({ basicAuthPassword: undefined, originSecret: `${SECRET}\n` }),
    ).toThrow(/newlines/);
  });

  it("refuses a short origin secret or password", () => {
    expect(() =>
      viewerRequestInjection({ basicAuthPassword: undefined, originSecret: "x" }),
    ).toThrow();
    expect(() =>
      viewerRequestInjection({ basicAuthPassword: "short", originSecret: SECRET }),
    ).toThrow();
  });
});

// API Gateway
// decodes an /api/ path and the API resolves its dot segments, so
// /api/items/..%2f..%2fhealth answered as /api/health, outside every
// rule keyed on the path. No API path holds a `..` or a `%`.
describe("the API's paths", () => {
  const injection = viewerRequestInjection({ basicAuthPassword: undefined, originSecret: SECRET });

  it("refuses an encoded or double-encoded traversal, a dot segment and a backslash", async () => {
    for (const uri of [
      "/api/public/messages/..%2f..%2fhealth",
      "/api/public/messages/..%2F..%2Fhealth",
      "/api/health/..%2fpublic/messages",
      "/api/public/..%2fhealth%2fx",
      "/api/public%2fmessages",
      "/api%2fhealth",
      "/api/x/%2e%2e/health",
      "/api/x/..%252fhealth",
      "/api/x/%252e%252e%252fhealth",
      "/api/x/..%5chealth",
      "/api/public/messages/../health",
      "/api/public/messages%00",
    ]) {
      expect({ uri, ...((await run(injection, {}, uri)) as Response) }).toMatchObject({
        statusCode: 400,
        uri,
      });
    }
  });

  it("lets every contract's path through, a query string too", async () => {
    for (const uri of [
      "/api/health",
      "/api/public/messages",
      "/api/items/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b/part/p_1-x",
    ]) {
      expect(((await run(injection, {}, uri, { limit: { value: "200" } })) as Request).uri).toBe(
        uri,
      );
    }
  });

  it("leaves a page's own % and .. to the site", async () => {
    for (const uri of ["/contact/a%20b", "/blog/a..b", "/apiary/%2f"]) {
      expect(((await run(injection, {}, uri)) as Request).uri).toBe(uri);
    }
  });
});
