import { contracts } from "@acme/contracts";
import { http, HttpResponse } from "msw";
import { setupWorker } from "msw/browser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApiError } from "./api-client";
import { mockRoute } from "./mock-route";
import { publicCall } from "./public-call";

let seen: Request | undefined;
const worker = setupWorker(
  mockRoute(contracts.public.listMessages)(({ request }) => {
    seen = request;
    return { items: [], nextCursor: null };
  }),
  // A refusal as the API writes it: the code, the correlation id and the fields.
  http.post("*/api/public/messages", ({ request }) => {
    seen = request;
    return HttpResponse.json(
      {
        code: "invalid",
        correlationId: "c-1",
        details: [{ issue: "too_small", path: "body.body" }],
      },
      { status: 400 },
    );
  }),
);

beforeAll(async () => {
  await worker.start({ onUnhandledRequest: "error", quiet: true });
});
afterAll(() => {
  worker.stop();
});

describe("publicCall", () => {
  const read = { body: undefined, params: {}, query: {} } as const;

  it("asks for JSON, sends no body on a read, and no Referer", async () => {
    await publicCall("listMessages", read);
    expect(seen?.method).toBe("GET");
    expect(seen?.headers.get("accept")).toBe("application/json");
    expect(seen?.headers.get("content-type")).toBeNull();
    // A page's URL may carry a secret, which a Referer would copy into the API's logs.
    expect(seen?.referrerPolicy).toBe("no-referrer");
    expect(seen?.referrer).toBe("");
  });

  it("throws the API's refusal as an ApiError with its code, status and fields", async () => {
    const failed = await publicCall("sendMessage", {
      body: { body: "", email: "a@example.test", name: "A" },
      params: {},
      query: {},
    }).catch((error: unknown) => error);
    expect(seen?.headers.get("content-type")).toBe("application/json");
    expect(failed).toBeInstanceOf(ApiError);
    expect(failed).toMatchObject({
      code: "invalid",
      correlationId: "c-1",
      details: [{ issue: "too_small", path: "body.body" }],
      status: 400,
    });
  });
});
