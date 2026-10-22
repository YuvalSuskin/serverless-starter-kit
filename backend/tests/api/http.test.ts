// The HTTP behaviour that lives in one place: tested
// once here, so no route needs to test it again.
//
// Skeleton: the demo's store and its routes (the messages list) are the
// routes these cases call; bootstrap step 6 points them at the first
// feature's.
import { contracts, CORRELATION_ID_HEADER, ErrorBody } from "@acme/contracts";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import type { ApiEnv, AppDeps } from "../../src/api/http/types";

import { createApp } from "../../src/api/app/create-app";
import { definePublicRoute } from "../../src/api/http/define-route";
import { errorResponse } from "../../src/api/http/errors";
import { fakeMailer } from "../../src/fakes/mailer";
import { fakeMessageStore } from "../../src/fakes/message-store";
import { fakePlatform } from "../../src/fakes/platform";
import { RateLimited } from "../../src/platform/errors";
import { testApp } from "../support/test-app";

const body = async (response: Response) => ErrorBody.parse(await response.json());

describe("correlation id", () => {
  it("is generated, returned in a header, and on every log line", async () => {
    const { app, log } = testApp();
    const response = await app.request("/api/health");
    const id = response.headers.get(CORRELATION_ID_HEADER);
    expect(id).toMatch(/^[\w-]{8,}$/);
    expect(log.lines.every((line) => line.fields.correlationId === id)).toBe(true);
  });

  it("reuses a well-formed id from the client, and replaces a malformed one", async () => {
    const { app } = testApp();
    const good = await app.request("/api/health", {
      headers: { [CORRELATION_ID_HEADER]: "client-abc-123" },
    });
    expect(good.headers.get(CORRELATION_ID_HEADER)).toBe("client-abc-123");
    const bad = await app.request("/api/health", {
      headers: { [CORRELATION_ID_HEADER]: "<script>" },
    });
    expect(bad.headers.get(CORRELATION_ID_HEADER)).not.toBe("<script>");
  });
});

describe("errors", () => {
  it("answers an unknown route with a not_found body carrying the correlation id", async () => {
    const { app } = testApp();
    const response = await app.request("/api/nope");
    expect(response.status).toBe(404);
    expect(await body(response)).toEqual({
      code: "not_found",
      correlationId: response.headers.get(CORRELATION_ID_HEADER),
    });
  });

  it("rejects a body over the limit with 413 before any route runs", async () => {
    const { app } = testApp();
    const response = await app.request("/api/health", {
      body: "x".repeat(70 * 1024),
      method: "POST",
    });
    expect(response.status).toBe(413);
    expect((await body(response)).code).toBe("payload_too_large");
  });

  it("names the invalid field and how it failed, without prose", async () => {
    const { app } = testApp();
    const response = await app.request(`${contracts.public.listMessages.path}?limit=0`);
    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({
      code: "invalid",
      details: [{ issue: "too_small", path: "query.limit" }],
    });
  });

  it("answers a body that is not JSON with 400 invalid_json", async () => {
    const { app } = testApp();
    const response = await app.request(contracts.public.sendMessage.path, {
      body: "{not json",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({
      code: "invalid",
      details: [{ issue: "invalid_json", path: "body" }],
    });
  });

  // A refused caller gets 429 with the API's error shape.
  it("answers a RateLimited refusal with 429 rate_limited", async () => {
    const { log } = fakePlatform();
    const app = new Hono<ApiEnv>();
    app.get("/probe", () => {
      throw new RateLimited("too many requests");
    });
    app.onError((error, c) => errorResponse(c, error, log));
    const response = await app.request("/probe");
    expect(response.status).toBe(429);
    expect(await body(response)).toEqual({ code: "rate_limited", correlationId: "unknown" });
  });

  it("turns an unexpected failure into a 500 that is logged in full and leaks nothing", async () => {
    const { log, platform } = fakePlatform();
    const app = createApp({
      mailer: fakeMailer({ usage: platform.usage }),
      messages: {
        list: () => Promise.reject(new Error("database on fire")),
        put: () => Promise.resolve(),
      },
      ownerAddress: undefined,
      platform,
      stage: "test",
    });
    const response = await app.request(contracts.public.listMessages.path);
    expect(response.status).toBe(500);
    const error = await body(response);
    expect(error).toEqual({ code: "internal", correlationId: expect.any(String) as unknown });
    expect(JSON.stringify(error)).not.toContain("fire");
    expect(log.lines).toContainEqual(
      expect.objectContaining({ level: "error", message: "unhandled error" }),
    );
  });
});

// CloudFront's cache key holds neither a cookie nor most headers, so an answer
// that a shared cache may keep would reach the next visitor of the same URL.
describe("shared caches", () => {
  const cacheControl = (response: Response) => response.headers.get("cache-control");

  it("every refusal says no-store, whatever the route set before it", async () => {
    const { app } = testApp();
    const refusals = [
      await app.request("/api/nope"),
      await app.request(`${contracts.public.listMessages.path}?limit=0`),
      await app.request(contracts.public.sendMessage.path, {
        body: "text",
        headers: { "content-type": "text/plain" },
        method: "POST",
      }),
    ];
    expect(refusals.map((r) => r.status)).toEqual([404, 400, 415]);
    for (const response of refusals) expect(cacheControl(response)).toBe("no-store");

    const { log } = fakePlatform();
    const probe = new Hono<ApiEnv>();
    probe.get("/cached-then-broken", (c) => {
      c.header("Cache-Control", "public, max-age=60");
      throw new Error("broke after choosing a cache");
    });
    probe.onError((error, c) => errorResponse(c, error, log));
    const broken = await probe.request("/cached-then-broken");
    expect(broken.status).toBe(500);
    expect(cacheControl(broken)).toBe("no-store");
  });

  it("an answer that does not say how it is cached is never kept", async () => {
    const { app } = testApp();
    expect(cacheControl(await app.request("/api/health"))).toBe("no-store");
    expect(cacheControl(await app.request(contracts.public.listMessages.path))).toBe("no-store");
  });
});

describe("output", () => {
  it("drops fields the contract does not declare, in production too", async () => {
    const { platform } = fakePlatform();
    const app = new Hono<ApiEnv>();
    const deps: AppDeps = {
      mailer: fakeMailer({ usage: platform.usage }),
      messages: fakeMessageStore(platform.usage),
      ownerAddress: undefined,
      platform,
      stage: "test",
    };
    definePublicRoute({
      contract: contracts.public.health,
      handler: () => ({ gps: [32.08, 34.78], status: "ok" }) as { status: "ok" },
    }).register(app, deps);
    expect(await (await app.request("/api/health")).json()).toEqual({ status: "ok" });
  });
});

describe("unmatched paths", () => {
  it("answer 404 with the request's correlation id, and are logged", async () => {
    const { app, log } = testApp();
    const response = await app.request("/foo");
    const id = response.headers.get(CORRELATION_ID_HEADER);
    expect(response.status).toBe(404);
    expect(id).not.toBe("unknown");
    expect((await body(response)).correlationId).toBe(id);
    expect(log.lines).toContainEqual(expect.objectContaining({ message: "request" }));
  });
});

// The security chaos run (2026-10-21): API Gateway decodes the path and the
// Request resolves its dot segments, so /api/public/things/..%2f..%2fhealth
// answered as /api/health. The edge refuses it first (deploy/src/edge.ts); the
// API does too.
describe("paths that reach a route only once decoded", () => {
  it("answer 404, as API Gateway passes them and as Node's server does", async () => {
    const { app } = testApp();
    for (const rawPath of [
      "/api/public/things/../../health",
      "/api/health/../public/messages",
      "/api/public/things/..%2f..%2fhealth",
      "/api/x/%252e%252e%252fhealth",
      "/api/x/..\\health",
      "/api/x/./health",
      "/api/x/%E0%A4%A",
    ]) {
      const lambda = await app.request("/api/health", {}, { event: { rawPath } });
      expect({ rawPath, status: lambda.status }).toEqual({ rawPath, status: 404 });
      const node = await app.request("/api/health", {}, { incoming: { url: rawPath } });
      expect({ rawPath, status: node.status }).toEqual({ rawPath, status: 404 });
    }
  });

  it("leave the plain path, its query too, to its route", async () => {
    const { app } = testApp();
    const env = { event: { rawPath: "/api/health", rawQueryString: "a=..%2f" } };
    expect((await app.request("/api/health?a=..%2f", {}, env)).status).toBe(200);
    expect((await app.request("/api/health")).status).toBe(200);
  });
});

describe("log context", () => {
  it("carries the stage on every line", async () => {
    const { app, log } = testApp();
    await app.request("/api/health");
    expect(log.lines.length).toBeGreaterThan(0);
    expect(log.lines.every((line) => line.fields.stage === "test")).toBe(true);
  });
});
