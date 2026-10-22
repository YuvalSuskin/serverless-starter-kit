// Skeleton: tests of the template's demo hooks, replaced by bootstrap step 6.
import type { ReactNode } from "react";

import { contracts, type Message } from "@acme/contracts";
import { http, HttpResponse } from "msw";
import { setupWorker } from "msw/browser";
import { SWRConfig } from "swr";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";

import { ApiError } from "./api-client";
import { refusedFields, useMessages, useSendMessage } from "./messages";
import { mockRoute } from "./mock-route";

// What the dev seed holds for the demo unit (backend/src/entries/dev/seed.ts),
// newest first: the order the list route answers in.
const SEEDED: Message[] = [
  {
    body: "Thank you for the quick reply yesterday. We would like to book.",
    createdAt: "2025-12-03T08:05:00.000Z",
    email: "noa@example.test",
    id: "01900000-0000-7000-9b00-000000000003",
    name: "Noa Barak",
  },
  {
    body: "Could you send me your price list, please?",
    createdAt: "2025-12-02T14:40:00.000Z",
    email: "daniel@example.test",
    id: "01900000-0000-7000-9b00-000000000002",
    name: "Daniel Levi",
  },
  {
    body: "Hi! Do you have any dates free in the spring?",
    createdAt: "2025-12-01T09:15:00.000Z",
    email: "maya@example.test",
    id: "01900000-0000-7000-9b00-000000000001",
    name: "Maya Cohen",
  },
];

const worker = setupWorker();
beforeAll(async () => {
  await worker.start({ onUnhandledRequest: "error", quiet: true });
});
afterEach(() => {
  worker.resetHandlers();
});
afterAll(() => {
  worker.stop();
});

// A fresh SWR cache per test: the list is cached by its key.
const fresh = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

const NEW_MESSAGE = { body: "A new message.", email: "ravit@example.test", name: "Ravit" };

describe("useMessages", () => {
  it("is loading at first, then holds the messages the API lists, newest first", async () => {
    // The API answers only when the test lets it, so "loading at first" is
    // not a race against the network.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    worker.use(
      http.get(`*${contracts.public.listMessages.path}`, async () => {
        await gate;
        return HttpResponse.json(
          contracts.public.listMessages.output.parse({ items: SEEDED, nextCursor: null }),
        );
      }),
    );
    const { result } = await renderHook(() => useMessages(), { wrapper: fresh });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
    release();
    await expect.poll(() => result.current.data).toEqual(SEEDED);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  it("holds an empty list as an empty list, not as no data", async () => {
    worker.use(mockRoute(contracts.public.listMessages)(() => ({ items: [], nextCursor: null })));
    const { result } = await renderHook(() => useMessages(), { wrapper: fresh });
    await expect.poll(() => result.current.data).toEqual([]);
  });

  it("surfaces the API's refusal as an ApiError", async () => {
    worker.use(
      http.get(`*${contracts.public.listMessages.path}`, () =>
        HttpResponse.json({ code: "internal", correlationId: "c1" }, { status: 500 }),
      ),
    );
    const { result } = await renderHook(() => useMessages(), { wrapper: fresh });
    await expect.poll(() => result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.data).toBeUndefined();
  });
});

describe("useSendMessage", () => {
  it("posts the message as the contract says and answers with the stored one", async () => {
    let sent: Request | undefined;
    worker.use(
      mockRoute(contracts.public.sendMessage)(({ request }) => {
        sent = request.clone();
        return { ...NEW_MESSAGE, createdAt: "2026-10-21T10:00:00.000Z", id: "m4" };
      }),
    );
    const { result } = await renderHook(() => useSendMessage(), { wrapper: fresh });
    expect(result.current.isPending).toBe(false);
    const stored = await result.current.trigger(NEW_MESSAGE);
    expect(stored).toMatchObject({ ...NEW_MESSAGE, id: "m4" });
    expect(sent?.method).toBe("POST");
    expect(await sent?.json()).toEqual(NEW_MESSAGE);
    await expect.poll(() => result.current.isPending).toBe(false);
  });

  it("puts the stored message first in the list the page already shows", async () => {
    const stored: Message[] = [...SEEDED];
    let reads = 0;
    worker.use(
      mockRoute(contracts.public.listMessages)(() => {
        reads += 1;
        return { items: stored, nextCursor: null };
      }),
      mockRoute(contracts.public.sendMessage)(() => {
        const message = { ...NEW_MESSAGE, createdAt: "2026-10-21T10:00:00.000Z", id: "m4" };
        stored.unshift(message);
        return message;
      }),
    );
    const { result } = await renderHook(() => ({ list: useMessages(), send: useSendMessage() }), {
      wrapper: fresh,
    });
    await expect.poll(() => result.current.list.data?.length).toBe(3);
    await result.current.send.trigger(NEW_MESSAGE);
    await expect.poll(() => result.current.list.data?.[0]?.id).toBe("m4");
    expect(result.current.list.data).toHaveLength(4);
    // The list is read again behind the change: the page ends up with the server's.
    await expect.poll(() => reads).toBe(2);
  });

  it("rejects with the contract's refusal, naming the field, when the body is empty", async () => {
    worker.use(
      http.post(`*${contracts.public.sendMessage.path}`, () =>
        HttpResponse.json(
          {
            code: "invalid",
            correlationId: "c1",
            details: [{ issue: "too_small", path: "body.body" }],
          },
          { status: 400 },
        ),
      ),
    );
    const { result } = await renderHook(() => useSendMessage(), { wrapper: fresh });
    const error = await result.current
      .trigger({ ...NEW_MESSAGE, body: "" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "invalid",
      details: [{ issue: "too_small", path: "body.body" }],
    });
    await expect.poll(() => result.current.isPending).toBe(false);
  });
});

describe("refusedFields", () => {
  const refusal = (details: { issue: string; path: string }[]) =>
    new ApiError(400, "invalid", "c1", details);

  it("names the first issue of each field the API refused", () => {
    expect(
      refusedFields(
        refusal([
          { issue: "too_small", path: "body.body" },
          { issue: "invalid_format", path: "body.email" },
          { issue: "too_big", path: "body.email" },
        ]),
      ),
    ).toEqual({ body: "too_small", email: "invalid_format" });
  });

  it("is empty when the refusal names no field of the message", () => {
    expect(refusedFields(refusal([{ issue: "invalid_json", path: "body" }]))).toEqual({});
  });

  it("is undefined for any other failure, so it is never taken for bad input", () => {
    expect(refusedFields(new ApiError(500, "internal", "c1"))).toBeUndefined();
    expect(refusedFields(new TypeError("Failed to fetch"))).toBeUndefined();
  });
});
