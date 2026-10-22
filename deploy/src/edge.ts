// Skeleton: code injected at the start of the router's viewer-request CloudFront
// Function. It runs on every request, before the cache, so a
// cached page is behind basic auth too. CloudFront Functions run their own
// JavaScript runtime (cloudfront-js-2.0): no imports, and every name here is
// prefixed so it cannot clash with the routing code SST appends.

// The header names the API reads: one home, the contracts.
import { ORIGIN_SECRET_HEADER, VIEWER_ADDRESS_HEADER } from "@acme/contracts/client/core";
import { minify } from "terser";

const BASIC_AUTH_USER = "acme";
export const CACHE_KEY_HEADER = "x-open-next-cache-key";

export interface ViewerRequestOptions {
  /** The dev password; absent on stages without basic auth (production). */
  basicAuthPassword: string | undefined;
  /** Proves to the API and the site that a request came through CloudFront. */
  originSecret: string;
}

/** The value a browser sends after the visitor types the user name and password. */
export function basicAuthHeader(password: string): string {
  const credentials = Buffer.from(BASIC_AUTH_USER + ":" + password).toString("base64");
  return `Basic ${credentials}`;
}

export function viewerRequestInjection({
  basicAuthPassword,
  originSecret,
}: ViewerRequestOptions): string {
  if (originSecret.length < 32) throw new Error("The origin secret must be at least 32 characters");
  // A header value with a newline (a secret set from `openssl ... |` without
  // `tr -d '\n'`) makes CloudFront refuse every request: 502
  // FunctionValidationError.
  if (!/^[\x21-\x7e]+$/.test(originSecret)) {
    throw new Error("The origin secret must be printable ASCII without spaces or newlines");
  }
  if (basicAuthPassword !== undefined && basicAuthPassword.length < 16) {
    throw new Error("The basic auth password must be at least 16 characters");
  }
  const lines = ["var kvH = event.request.headers;"];
  if (basicAuthPassword !== undefined) {
    lines.push(
      `var kvA = kvH.authorization ? kvH.authorization.value : "", kvE = ${JSON.stringify(basicAuthHeader(basicAuthPassword))}, kvD = kvA.length ^ kvE.length;`,
      // Same time for every wrong answer of the right length.
      `for (var kvI = 0; kvI < kvE.length; kvI++) kvD |= kvA.charCodeAt(kvI) ^ kvE.charCodeAt(kvI);`,
      `if (kvD !== 0) return { statusCode: 401, statusDescription: "Unauthorized", headers: { "www-authenticate": { value: 'Basic realm="Acme dev", charset="UTF-8"' }, "cache-control": { value: "no-store" } } };`,
      // No origin ever sees the dev password.
      `delete kvH.authorization;`,
    );
  }
  // One line for every refusal: no API path has a `..` or a `%` (every
  // parameter is an id, [\w-]); API Gateway decodes the path and the API
  // resolves its dot segments, so `/api/health/..%2fother/route` would reach
  // another route outside every rule keyed on its path (a WAF's, the logs').
  lines.push(
    `var kvU=event.request.uri;if(/^\\/api[\\/%]/.test(kvU)&&/\\.\\.|%/.test(kvU))return{statusCode:400};`,
  );
  lines.push(
    // OpenNext builds the request's URL from this; without it, the server
    // would see the API Gateway hostname.
    `kvH["x-forwarded-host"] = kvH.host;`,
    // Set on every stage, overwriting whatever the caller sent.
    `kvH[${JSON.stringify(ORIGIN_SECRET_HEADER)}] = { value: ${JSON.stringify(originSecret)} };`,
    // CloudFront's own CloudFront-Viewer-Address reaches an origin only
    // through an origin request policy that also forwards Host, which API
    // Gateway refuses; so the function writes it, in CloudFront's `ip:port`
    // form. A function is not told the port: 0.
    `kvH[${JSON.stringify(VIEWER_ADDRESS_HEADER)}] = { value: event.viewer.ip + ":0" };`,
    // OpenNext's cache key: an RSC payload and the HTML of the same URL must
    // never share a CloudFront cache entry (the router's cache policy keys on
    // this header). SST's Nextjs component sets it the same way.
    `var kvK = "";`,
    `["rsc", "next-router-prefetch", "next-router-state-tree", "next-url", "x-prerender-revalidate"].forEach(function (h) { if (kvH[h]) kvK += kvH[h].value; });`,
    `kvH[${JSON.stringify(CACHE_KEY_HEADER)}] = { value: require("crypto").createHash("md5").update(kvK).digest("hex") };`,
  );
  return lines.join("\n");
}

/**
 * The whole function's code, SST's router and this injection, compacted
 * before CloudFront gets it (decision S20): CloudFront refuses
 * code over 10,240 bytes, and SST hands it over as written, 9,854 bytes on dev
 * on 2026-10-19. Local names are shortened and whitespace goes; `handler`
 * (which CloudFront calls) and `cf` (the cloudfront module, as AWS writes it)
 * keep their names, and no newer syntax than the code's own is written
 * (ecma 5). edge-function.test.ts runs both versions.
 */
export async function compactFunctionCode(code: string): Promise<string> {
  try {
    const result = await minify(code, {
      compress: { top_retain: ["handler"] },
      ecma: 5,
      mangle: { reserved: ["cf", "handler"] },
      module: true,
    });
    if (result.code) return result.code;
  } catch {
    // Terser's error can quote the code, and the code holds the origin
    // secret and dev's password: never pass it on.
  }
  throw new Error("The CloudFront function's code could not be compacted");
}
