// The site answers only the distribution, which sends the origin secret. The site's
// API Gateway default address would otherwise serve anyone who knows it,
// around basic auth and the WAF.

import { NextRequest, type NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy as proxyOf } from "./proxy";

const SECRET = "test-origin-secret-00000000000000";
// ORIGIN_SECRET_HEADER in @acme/contracts, which only lib/data imports.
const ORIGIN_SECRET_HEADER = "x-origin-secret";

afterEach(() => {
  vi.unstubAllEnvs();
});

const proxy = (r: NextRequest) => proxyOf(r) as NextResponse;
const request = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(new URL(path, "https://site.example"), { headers });
const passesThrough = (response: Response) => response.headers.get("x-middleware-next") === "1";

describe("with ORIGIN_SECRET set", () => {
  it.each(["/", "/messages", "/api/health", "/_next/static/x.js"])(
    "refuses %s without the origin secret with 403",
    async (path) => {
      vi.stubEnv("ORIGIN_SECRET", SECRET);
      const response = proxy(request(path));
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).not.toContain(SECRET);
    },
  );

  it("refuses a wrong secret, and one that only starts with the right one", () => {
    vi.stubEnv("ORIGIN_SECRET", SECRET);
    for (const secret of ["wrong", `${SECRET}x`, SECRET.slice(0, -1), ""]) {
      expect(proxy(request("/", { [ORIGIN_SECRET_HEADER]: secret })).status).toBe(403);
    }
  });

  it("lets a request carrying the matching secret through", () => {
    vi.stubEnv("ORIGIN_SECRET", SECRET);
    expect(passesThrough(proxy(request("/messages", { [ORIGIN_SECRET_HEADER]: SECRET })))).toBe(
      true,
    );
  });
});

describe("without ORIGIN_SECRET (next dev, e2e)", () => {
  it("lets every request through", () => {
    vi.stubEnv("ORIGIN_SECRET", undefined);
    vi.stubEnv("API_PROXY_ORIGIN", undefined);
    expect(passesThrough(proxy(request("/messages")))).toBe(true);
  });

  it("still sends /api/* and /media/* to API_PROXY_ORIGIN, and nothing else", () => {
    vi.stubEnv("ORIGIN_SECRET", undefined);
    vi.stubEnv("API_PROXY_ORIGIN", "http://127.0.0.1:8787");
    expect(proxy(request("/api/health?x=1")).headers.get("x-middleware-rewrite")).toBe(
      "http://127.0.0.1:8787/api/health?x=1",
    );
    expect(proxy(request("/media/a.webp")).headers.get("x-middleware-rewrite")).toBe(
      "http://127.0.0.1:8787/media/a.webp",
    );
    expect(passesThrough(proxy(request("/messages")))).toBe(true);
    expect(passesThrough(proxy(request("/apiary")))).toBe(true);
  });
});

// A server action call Next would answer with a 500 is refused first, as a
// 4xx (src/lib/action-request.ts holds the rules).
describe("server action calls", () => {
  const action = (headers: Record<string, string>, body: BodyInit = "[null]", path = "/") =>
    new NextRequest(new URL(path, "https://site.example"), {
      body,
      headers: { host: "site.example", "next-action": "ab".repeat(21), ...headers },
      method: "POST",
    });

  it("refuses a foreign Origin with 403 and a broken body with 400, never kept", async () => {
    vi.stubEnv("ORIGIN_SECRET", undefined);
    const foreign = await proxyOf(action({ origin: "https://evil.example" }));
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get("cache-control")).toBe("no-store");
    const broken = await proxyOf(action({ origin: "https://site.example" }, "{{{not-a-form"));
    expect(broken.status).toBe(400);
  });

  it("passes a form's own call on, the origin secret checked first", async () => {
    vi.stubEnv("ORIGIN_SECRET", SECRET);
    const own = await proxyOf(
      action({ origin: "https://site.example", [ORIGIN_SECRET_HEADER]: SECRET }),
    );
    expect(passesThrough(own)).toBe(true);
    expect((await proxyOf(action({ origin: "https://evil.example" }))).status).toBe(403);
  });

  it("leaves a POST to /api to the API (API_PROXY_ORIGIN in e2e)", async () => {
    vi.stubEnv("ORIGIN_SECRET", undefined);
    vi.stubEnv("API_PROXY_ORIGIN", "http://127.0.0.1:8787");
    const response = await proxyOf(
      action({ origin: "https://evil.example" }, "{", "/api/public/messages"),
    );
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://127.0.0.1:8787/api/public/messages",
    );
  });
});
