// The API answers
// only the distribution (and the site's server render), which send the origin
// secret. Each API Gateway default address would otherwise answer anyone who
// knows it, around basic auth today and the WAF later.
import { CORRELATION_ID_HEADER, ErrorBody, ORIGIN_SECRET_HEADER } from "@acme/contracts";
import { describe, expect, it } from "vitest";

import { testApp } from "../support/test-app";

const ORIGIN_SECRET = "test-origin-secret-00000000000000";

describe("with ORIGIN_SECRET set", () => {
  it("refuses a request without the origin secret with 403 forbidden", async () => {
    const { app } = testApp({ originSecret: ORIGIN_SECRET });
    const response = await app.request("/api/public/messages");
    expect(response.status).toBe(403);
    const body = ErrorBody.parse(await response.json());
    expect(body.code).toBe("forbidden");
    expect(response.headers.get(CORRELATION_ID_HEADER)).toBe(body.correlationId);
    // CloudFront must not keep a refusal while a new secret rolls out.
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a wrong secret, and one that only starts with the right one", async () => {
    const { app } = testApp({ originSecret: ORIGIN_SECRET });
    for (const secret of ["wrong", `${ORIGIN_SECRET}x`, ORIGIN_SECRET.slice(0, -1), ""]) {
      const response = await app.request("/api/health", {
        headers: { [ORIGIN_SECRET_HEADER]: secret },
      });
      expect(response.status).toBe(403);
    }
  });

  it("refuses /api/health and unknown paths too: nothing answers without it", async () => {
    const { app } = testApp({ originSecret: ORIGIN_SECRET });
    expect((await app.request("/api/health")).status).toBe(403);
    expect((await app.request("/api/nope")).status).toBe(403);
    expect((await app.request("/", { method: "POST" })).status).toBe(403);
  });

  it("serves a request carrying the matching secret", async () => {
    const { app } = testApp({ originSecret: ORIGIN_SECRET });
    const response = await app.request("/api/health", {
      headers: { [ORIGIN_SECRET_HEADER]: ORIGIN_SECRET },
    });
    expect(response.status).toBe(200);
  });

  it("logs the refusal with its context, never the secret sent", async () => {
    const { app, log } = testApp({ originSecret: ORIGIN_SECRET });
    const guess = "a-guessed-secret-that-must-not-be-logged";
    await app.request("/api/health", { headers: { [ORIGIN_SECRET_HEADER]: guess } });
    const lines = JSON.stringify(log.lines);
    expect(lines).toContain("origin secret");
    expect(lines).not.toContain(guess);
    expect(lines).not.toContain(ORIGIN_SECRET);
  });
});

describe("without ORIGIN_SECRET (pnpm dev, tests)", () => {
  it("serves requests without the header, as before", async () => {
    const { app } = testApp();
    expect((await app.request("/api/health")).status).toBe(200);
  });
});
