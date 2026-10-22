import type { BrowserContext } from "@playwright/test";

import { isLocalUrl } from "./local-url";

/**
 * Aborts every request and WebSocket of the context that is not on this
 * machine. Returns the list it records them in, live: a test that ends with it
 * not empty failed to be offline.
 */
export async function blockOffMachine(context: BrowserContext): Promise<string[]> {
  const blocked: string[] = [];
  await context.route(
    (url) => !isLocalUrl(url.href),
    async (route) => {
      blocked.push(route.request().url());
      await route.abort("blockedbyclient");
    },
  );
  // context.route does not see WebSockets.
  await context.routeWebSocket(
    (url) => !isLocalUrl(url.href),
    async (socket) => {
      blocked.push(socket.url());
      await socket.close({ code: 1008, reason: "offline" });
    },
  );
  return blocked;
}
