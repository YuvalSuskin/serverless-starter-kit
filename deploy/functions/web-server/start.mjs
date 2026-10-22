// Skeleton: the site Lambda's entry, copied beside
// OpenNext's index.mjs by src/web.ts's installServerStart. Before anything
// else in the cold start, it wakes the API: after a quiet spell both Lambdas
// are cold, and a page's first API call would begin the API's cold
// start only once the site's own had ended. The first server call waits for
// this answer (frontend/src/lib/data/api-warm-up.ts reads the same promise,
// under the same key), so it lands on the environment it woke. Plain
// JavaScript: Lambda runs it as it is. Never throws; a failed warm-up changes
// nothing.
import http from "node:http";
import https from "node:https";

const KEY = Symbol.for("acme.apiWarmUp");
/** How long the first call may wait for the API, from here. */
const WARM_UP_WAIT_MS = 2500;
/** How long the start waits for the request to leave, at most. */
const SEND_WAIT_MS = 300;

/**
 * Sends GET /api/health and resolves once the request is on the wire: the
 * loading that follows keeps the event loop busy, and a request only begun
 * would leave after it. Keeps the answer's promise under KEY.
 */
function wakeApi(origin, secret) {
  return new Promise((sent) => {
    const url = new URL("/api/health", origin);
    const answered = new Promise((done) => {
      const request = (url.protocol === "https:" ? https : http).request(url, {
        headers: secret ? { "x-origin-secret": secret } : {},
        timeout: WARM_UP_WAIT_MS,
      });
      request.once("socket", (socket) => {
        socket.once(url.protocol === "https:" ? "secureConnect" : "connect", () => {
          setImmediate(sent);
        });
      });
      request.once("response", (response) => {
        response.resume();
        response.once("end", done);
        response.once("error", done);
      });
      request.once("timeout", () => {
        request.destroy();
      });
      request.once("error", done);
      request.once("close", done);
      request.end();
    });
    globalThis[KEY] = answered.then(() => undefined);
    answered.then(sent, sent);
    setTimeout(sent, SEND_WAIT_MS).unref();
  });
}

const origin = process.env.API_ORIGIN;
if (origin && globalThis[KEY] === undefined) {
  try {
    await wakeApi(origin, process.env.ORIGIN_SECRET);
  } catch {
    // The first call goes on as it would have.
  }
}

const opennext = await import("./index.mjs");
export const handler = opennext.handler;
