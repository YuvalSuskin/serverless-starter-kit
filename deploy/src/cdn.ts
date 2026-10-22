// Skeleton: the distribution's own settings on top of SST's router, which
// has one cache behaviour for everything: the security headers every answer
// carries, and no error answer kept at the edge.

/** HSTS's lifetime: two years, the value browsers' preload lists ask for. */
const HSTS_MAX_AGE_SECONDS = 63_072_000;

/**
 * The security headers every answer of the distribution carries, through a
 * response headers policy on each behaviour. HSTS covers every subdomain
 * (each one served is HTTPS-only; mail.* and the DKIM names hold no web
 * server), not preloaded yet. No page is meant to be framed. Referrer-Policy
 * yields to an origin's own (`override: false`), so a page's stricter
 * no-referrer meta wins in the browser. A CSP is a later addition. Nothing
 * here sets Cache-Control.
 */
export function securityHeaders() {
  return {
    contentTypeOptions: { override: true },
    frameOptions: { frameOption: "DENY", override: true },
    referrerPolicy: { override: false, referrerPolicy: "strict-origin-when-cross-origin" },
    strictTransportSecurity: {
      accessControlMaxAgeSec: HSTS_MAX_AGE_SECONDS,
      includeSubdomains: true,
      override: true,
      preload: false,
    },
  };
}

/**
 * What an answer lacks of the security headers, for the smoke test; undefined when
 * it carries them all. Also refuses Next's x-powered-by.
 */
export function missingSecurityHeaders(headers: Headers): string | undefined {
  const want: Record<string, string> = {
    "referrer-policy": "strict-origin-when-cross-origin",
    "strict-transport-security": `max-age=${String(HSTS_MAX_AGE_SECONDS)}; includeSubDomains`,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
  const problems = Object.entries(want)
    .filter(([name, value]) => headers.get(name) !== value)
    .map(([name, value]) => `${name}: ${value}`);
  if (headers.has("x-powered-by")) problems.push("no x-powered-by");
  return problems.length ? `expected ${problems.join(", ")}` : undefined;
}

/**
 * Every error status a distribution may configure, the ones CloudFront keeps
 * by default among them (404, 414 and 5xx, for 10 seconds).
 */
const CONFIGURABLE_ERRORS = [400, 403, 404, 405, 414, 416, 500, 501, 502, 503, 504];

/**
 * No error answer is kept at the edge beyond what the origin itself allows
 * (the API's are no-store). The cache key holds no session or code, so a kept
 * 404 for one visitor's request would answer another's at the same URL; and
 * CloudFront keeps a 5xx for its error caching minimum TTL whatever the
 * origin says. No page of its own: the origin's answer reaches the visitor
 * unchanged.
 */
export function noErrorCaching(): { errorCachingMinTtl: number; errorCode: number }[] {
  return CONFIGURABLE_ERRORS.map((errorCode) => ({ errorCachingMinTtl: 0, errorCode }));
}
