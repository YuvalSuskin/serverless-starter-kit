import { CORRELATION_ID_HEADER } from "@acme/contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import type { ApiEnv, AppDeps, Route } from "../http/types";

import { Forbidden, NotFound, PayloadTooLarge } from "../../platform/errors";
import { withLogContext } from "../../platform/log-context";
import { errorResponse } from "../http/errors";
import { carriesOriginSecret } from "../http/origin-secret";
import { rawTarget, traversing } from "../http/raw-target";
import { createPublicApi, publicRoutes } from "../public/routes";

export type { AppDeps } from "../http/types";

const MAX_BODY_BYTES = 64 * 1024;
const CORRELATION_ID = /^[\w.-]{8,128}$/;

/** Every route in the app: the registry the sweeps read. */
export const allRoutes: readonly Route[] = [...publicRoutes];

// The one place that sees every sub-app. Splitting the API later
// means an entry that mounts one sub-app instead; URLs do not change.
export function createApp(deps: AppDeps): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();
  const { log } = deps.platform;

  // Correlation id and log context for everything below.
  app.use("*", async (c, next) => {
    const incoming = c.req.header(CORRELATION_ID_HEADER);
    const correlationId =
      incoming !== undefined && CORRELATION_ID.test(incoming) ? incoming : deps.platform.ids.next();
    await withLogContext({ correlationId, principal: "anonymous", stage: deps.stage }, async () => {
      const started = deps.platform.clock.now().getTime();
      await next();
      c.header(CORRELATION_ID_HEADER, correlationId);
      log.info("request", {
        durationMs: deps.platform.clock.now().getTime() - started,
        method: c.req.method,
        status: c.res.status,
      });
    });
  });

  // An answer that does not say how it may be cached is never kept: most
  // depend on a header or cookie the distribution's cache key leaves out (a
  // session, say). The first route that may be kept adds a cache option to
  // definePublicRoute, which sets the header and the test that pins it.
  app.use("*", async (c, next) => {
    await next();
    if (!c.res.headers.has("cache-control")) c.header("Cache-Control", "no-store");
  });

  // Only the distribution and the site's server render, which send the origin
  // secret, reach the API: each API Gateway default address would otherwise
  // answer anyone who knows it, around basic auth and the WAF. Every path, /api/health too.
  // Without ORIGIN_SECRET (pnpm dev, tests) nothing is refused here.
  const { originSecret } = deps;
  if (originSecret !== undefined) {
    app.use("*", async (c, next) => {
      if (!carriesOriginSecret((name) => c.req.header(name), originSecret)) {
        log.warn("refused: no origin secret, so not from the distribution");
        // Never cached: a refusal while a new secret rolls out must not outlive it.
        c.header("cache-control", "no-store");
        throw new Forbidden("origin secret");
      }
      await next();
    });
  }

  // Behind the edge's own refusal: a path that reaches a route only once
  // decoded and resolved is no route's (raw-target.ts).
  app.use("*", async (c, next) => {
    if (traversing(rawTarget(c).path)) throw new NotFound("route");
    await next();
  });

  // Every request keeps the app's body limit.
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new PayloadTooLarge(`body over ${MAX_BODY_BYTES.toString()} bytes`);
      },
    }),
  );

  app.route("/", createPublicApi(deps));

  // Answered here rather than thrown: a thrown error on an unmatched path
  // escapes the log context, and the 404 would lose its correlation id.
  app.notFound((c) => errorResponse(c, new NotFound("route"), log));
  app.onError((error, c) => errorResponse(c, error, log));
  return app;
}
