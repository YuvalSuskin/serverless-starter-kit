import { describe, expect, it } from "vitest";

import { CollectorBlocked, politeFetcher } from "./http.ts";

function scripted(responses: Record<string, Response | Error>) {
  const calls: string[] = [];
  const fetch = (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push(url);
    const answer = responses[url];
    if (answer instanceof Error) return Promise.reject(answer);
    return Promise.resolve(answer ?? new Response("", { status: 404 }));
  };
  return { calls, fetch };
}

function clock() {
  let now = 0;
  const waits: number[] = [];
  return {
    now: () => now,
    sleep: (ms: number) => {
      waits.push(ms);
      now += ms;
      return Promise.resolve();
    },
    tick: (ms: number) => {
      now += ms;
    },
    waits,
  };
}

const A = "https://a.example/1";
const A2 = "https://a.example/2";
const B = "https://b.example/1";
const ok = () => new Response("<html><body>hello</body></html>", { status: 200 });

describe("politeFetcher", () => {
  it("returns the status and the body as text", async () => {
    const time = clock();
    const fetcher = politeFetcher({
      ...time,
      fetch: scripted({ [A]: ok() }).fetch,
      source: "test",
    });
    expect(await fetcher(A)).toEqual({ body: "<html><body>hello</body></html>", status: 200 });
  });

  it("waits out the interval between two requests to one host, and not across hosts", async () => {
    const time = clock();
    const { fetch } = scripted({ [A]: ok(), [A2]: ok(), [B]: ok() });
    const fetcher = politeFetcher({ ...time, fetch, minIntervalMs: 1500, source: "test" });
    await fetcher(A);
    await fetcher(B);
    time.tick(500);
    await fetcher(A2);
    expect(time.waits).toEqual([1000]);
  });

  it.each([403, 429, 503])("stops on HTTP %i, without retrying", async (status) => {
    const { calls, fetch } = scripted({ [A]: new Response("no", { status }) });
    const fetcher = politeFetcher({ ...clock(), fetch, source: "google" });
    await expect(fetcher(A)).rejects.toThrow(CollectorBlocked);
    await expect(politeFetcher({ ...clock(), fetch, source: "google" })(A)).rejects.toThrow(
      /google.*503|google.*429|google.*403/,
    );
    expect(calls).toHaveLength(2);
  });

  it("stops on a challenge page served with 200", async () => {
    const page = new Response("<html><head><title>Just a moment...</title></head></html>", {
      status: 200,
    });
    const fetcher = politeFetcher({
      ...clock(),
      fetch: scripted({ [A]: page }).fetch,
      source: "google",
    });
    await expect(fetcher(A)).rejects.toThrow(/challenge/);
  });

  it("stops on a timeout", async () => {
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    const fetcher = politeFetcher({
      ...clock(),
      fetch: scripted({ [A]: timeout }).fetch,
      source: "google",
    });
    await expect(fetcher(A)).rejects.toThrow(/timed out/);
  });

  it("stops on a timeout while reading the body", async () => {
    const stalled = new Response(
      new ReadableStream({
        start: (controller) => {
          controller.error(new DOMException("The operation timed out.", "TimeoutError"));
        },
      }),
      { status: 200 },
    );
    const fetcher = politeFetcher({
      ...clock(),
      fetch: scripted({ [A]: stalled }).fetch,
      source: "google",
    });
    await expect(fetcher(A)).rejects.toThrow(CollectorBlocked);
  });

  it("runs one request per host at a time, even when called concurrently", async () => {
    let active = 0;
    let most = 0;
    const fetch = async () => {
      active += 1;
      most = Math.max(most, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return ok();
    };
    const fetcher = politeFetcher({ fetch, minIntervalMs: 0, source: "test" });
    await Promise.all([fetcher(A), fetcher(A2), fetcher(A)]);
    expect(most).toBe(1);
  });

  it("passes other network errors through, for the collector to judge", async () => {
    const fetcher = politeFetcher({
      ...clock(),
      fetch: scripted({ [A]: new TypeError("fetch failed") }).fetch,
      source: "test",
    });
    await expect(fetcher(A)).rejects.toThrow(TypeError);
  });
});
