// For stories whose components call the API through `src/lib/data/`: answer
// the routes a story names, after a delay if it asks (so a play function can
// look at a pending state), and let every other request through. Use it as a
// story's `beforeEach`: `beforeEach: stubFetch([...])`; it puts `fetch` back
// when the story ends.
//
// A route matches on the method and a pattern for the path. Each answer is
// built per request, so a story can count requests or change what it says.

export interface StubRoute {
  /** What to answer; a request that fails the way a lost connection does throws a TypeError. */
  answer: () => Response;
  delayMs?: number;
  method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  path: RegExp;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export function stubFetch(routes: readonly StubRoute[]): () => () => void {
  return () => {
    // Put back as it was, and called on `window`, so no `this` is lost.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- see above
    const real = window.fetch;
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      const route = routes.find((r) => r.method === method && r.path.test(url.pathname));
      if (!route) return real.call(window, input, init);
      if (route.delayMs !== undefined) await sleep(route.delayMs);
      return route.answer();
    };
    return () => {
      window.fetch = real;
    };
  };
}
