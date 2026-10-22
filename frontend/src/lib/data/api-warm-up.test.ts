import { afterEach, describe, expect, it, vi } from "vitest";

import { apiWarmedUp, forgetApiWarmUp, startApiWarmUp } from "./api-warm-up";

afterEach(() => {
  forgetApiWarmUp();
});

const answering = () =>
  vi.fn<typeof fetch>(() => Promise.resolve(new Response('{"status":"ok"}', { status: 200 })));

// The server's start-up wakes the API once, and the first
// server call waits for that answer instead of starting a second cold one.
describe("the API warm-up", () => {
  it("asks the API's health route once, with the origin secret", async () => {
    const fetcher = answering();
    startApiWarmUp("https://api.example.com", "secret-0000", { fetcher });
    startApiWarmUp("https://api.example.com", "secret-0000", { fetcher });
    await apiWarmedUp();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toEqual(new URL("https://api.example.com/api/health"));
    expect(init?.headers).toEqual({ "x-origin-secret": "secret-0000" });
  });

  it("the first call waits until the API has answered", async () => {
    const answer = Promise.withResolvers<Response>();
    const fetcher = vi.fn<typeof fetch>(() => answer.promise);
    startApiWarmUp("https://api.example.com", undefined, { fetcher });
    let waited = false;
    const waiting = apiWarmedUp().then(() => {
      waited = true;
    });
    await Promise.resolve();
    expect(waited).toBe(false);
    answer.resolve(new Response("{}"));
    await waiting;
    expect(waited).toBe(true);
  });

  it("a failed warm-up never fails the call that waits for it", async () => {
    startApiWarmUp("https://api.example.com", undefined, {
      fetcher: () => Promise.reject(new TypeError("fetch failed")),
    });
    await expect(apiWarmedUp()).resolves.toBeUndefined();
  });

  it("a slow API is waited for only up to the warm-up's limit", async () => {
    startApiWarmUp("https://api.example.com", undefined, {
      // A fetch that ends only when its signal aborts, as fetch does.
      fetcher: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("timed out", "TimeoutError"));
          });
        }),
      timeoutMs: 20,
    });
    const started = performance.now();
    await apiWarmedUp();
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("without an API origin nothing is asked and nothing waits", async () => {
    const fetcher = answering();
    startApiWarmUp(undefined, "secret-0000", { fetcher });
    await apiWarmedUp();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
