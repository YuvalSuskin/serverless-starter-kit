import { ORIGIN_SECRET_HEADER } from "@acme/contracts/client/core";
import { publicRoutes } from "@acme/contracts/client/public";

// The API's cold start, begun while the site's own runs. After
// a quiet spell both Lambdas are cold, and a page's first API call used to wake
// the API only once the site had started: the two cold starts ran one after
// the other. The server's start-up
// (src/instrumentation.ts) now asks the API's health route at once, and the
// first server call waits for that answer, so it lands on the environment the
// warm-up woke instead of starting a second one cold (a Lambda environment
// that is starting serves no other request). On Lambda the site's entry
// (deploy/functions/web-server/start.mjs) starts it before anything else
// loads, and keeps it under the same key, with the same route, header and
// limit; the hook here then finds it started. Server code only.

/**
 * How long the warm-up waits for the API, from the server's start. The API's
 * cold first answer measured 0.6 to 1.6 s on dev; past
 * this the waiting call goes on as before.
 */
const WARM_UP_WAIT_MS = 2500;

// On globalThis: the instrumentation hook and the pages are bundled apart, and each bundle
// has its own copy of this module.
const KEY = Symbol.for("acme.apiWarmUp");
const holder = globalThis as unknown as Record<typeof KEY, Promise<void> | undefined>;

/**
 * Asks the API's health route once per server process. Never throws, and the
 * promise it keeps never rejects: a failed or slow warm-up only leaves the
 * first call as it was. Nothing without an API origin (`next dev` without
 * one, a stage without one).
 */
export function startApiWarmUp(
  origin: string | undefined,
  originSecret: string | undefined,
  {
    fetcher = fetch,
    timeoutMs = WARM_UP_WAIT_MS,
  }: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): void {
  if (!origin || holder[KEY] !== undefined) return;
  holder[KEY] = (async () => {
    try {
      const response = await fetcher(new URL(publicRoutes.health.path, origin), {
        cache: "no-store",
        headers: originSecret ? { [ORIGIN_SECRET_HEADER]: originSecret } : {},
        signal: AbortSignal.timeout(timeoutMs),
      });
      await response.body?.cancel();
    } catch {
      // The first call goes on as it would have.
    }
  })();
}

/** Resolves once the warm-up has its answer or gave up; at once when none was started. */
export function apiWarmedUp(): Promise<void> {
  return holder[KEY] ?? Promise.resolve();
}

/** Tests only: forgets this process's warm-up. */
export function forgetApiWarmUp(): void {
  holder[KEY] = undefined;
}
