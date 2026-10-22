import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { CORRELATION_ID_HEADER, type ErrorBody, type ErrorCode } from "@acme/contracts";

import type { Logger } from "../../platform/logger";

import { Conflict, DomainError, Invalid } from "../../platform/errors";
import { currentLogContext } from "../../platform/log-context";

const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  conflict: 409,
  forbidden: 403,
  internal: 500,
  invalid: 400,
  not_found: 404,
  payload_too_large: 413,
  rate_limited: 429,
  unauthenticated: 401,
  unsupported_media_type: 415,
};

// The ONLY place errors become HTTP. Every body carries the
// correlation id, so a user's "it broke" leads straight to the logs.
export function errorResponse(c: Context, error: unknown, log: Logger): Response {
  const correlationId = currentLogContext()?.correlationId ?? "unknown";
  let body: ErrorBody;
  if (error instanceof DomainError) {
    body = { code: error.code, correlationId };
    if ((error instanceof Invalid || error instanceof Conflict) && error.details.length > 0) {
      body.details = error.details;
    }
    log.info("request refused", { code: error.code });
  } else {
    body = { code: "internal", correlationId };
    log.error("unhandled error", {
      error:
        error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
    });
  }
  c.header(CORRELATION_ID_HEADER, correlationId);
  // Never kept by any cache, whatever the route chose before it failed: the
  // distribution's cache key holds nothing that tells callers apart (a header,
  // a cookie), so a kept refusal would answer the next visitor of the URL too.
  c.header("Cache-Control", "no-store");
  return c.json(body, STATUS[body.code]);
}
