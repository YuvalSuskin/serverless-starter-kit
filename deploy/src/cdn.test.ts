import { describe, expect, it } from "vitest";

import { missingSecurityHeaders, noErrorCaching, securityHeaders } from "./cdn";

describe("securityHeaders", () => {
  it("HSTS for two years on every subdomain, not preloaded; nosniff; no framing", () => {
    const headers = securityHeaders();
    expect(headers.strictTransportSecurity).toEqual({
      accessControlMaxAgeSec: 63_072_000,
      includeSubdomains: true,
      override: true,
      preload: false,
    });
    expect(headers.contentTypeOptions).toEqual({ override: true });
    expect(headers.frameOptions).toEqual({ frameOption: "DENY", override: true });
  });

  it("strict-origin-when-cross-origin, yielding to an origin's own Referrer-Policy", () => {
    expect(securityHeaders().referrerPolicy).toEqual({
      override: false,
      referrerPolicy: "strict-origin-when-cross-origin",
    });
  });

  it("sets no Cache-Control, no CSP and no custom header", () => {
    expect(new Set(Object.keys(securityHeaders()))).toEqual(
      new Set(["contentTypeOptions", "frameOptions", "referrerPolicy", "strictTransportSecurity"]),
    );
  });
});

describe("missingSecurityHeaders (the smoke test's check)", () => {
  const served = new Headers({
    "referrer-policy": "strict-origin-when-cross-origin",
    "strict-transport-security": "max-age=63072000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });

  it("passes an answer with every header, as CloudFront writes them", () => {
    expect(missingSecurityHeaders(served)).toBeUndefined();
  });

  it("names each header missing or different, and Next's x-powered-by", () => {
    const headers = new Headers(served);
    headers.delete("x-frame-options");
    headers.set("strict-transport-security", "max-age=60");
    headers.set("x-powered-by", "Next.js");
    const problem = missingSecurityHeaders(headers) ?? "";
    expect(problem).toContain("x-frame-options: DENY");
    expect(problem).toContain("strict-transport-security");
    expect(problem).toContain("no x-powered-by");
    expect(problem).not.toContain("nosniff");
  });
});

describe("noErrorCaching", () => {
  it("keeps no error answer at the edge beyond what the origin itself allows", () => {
    // Every status CloudFront lets a distribution configure, the ones it
    // caches by default (404, 414, 5xx) among them.
    expect(noErrorCaching().map((r) => r.errorCode)).toEqual([
      400, 403, 404, 405, 414, 416, 500, 501, 502, 503, 504,
    ]);
    for (const response of noErrorCaching()) {
      // No page of its own: the origin's answer reaches the visitor as it is.
      expect(response).toEqual({ errorCachingMinTtl: 0, errorCode: response.errorCode });
    }
  });
});
