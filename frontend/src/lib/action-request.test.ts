// A forged server action call (the security chaos run, 2026-10-21): the form's
// action answered 500 to a foreign Origin, a body over 1 MB and a body React
// could not decode. Each is refused first, as a 4xx.
import { describe, expect, it } from "vitest";

import { ACTION_BODY_LIMIT, actionRefusal, foreignOrigin } from "./action-request";

const SITE = "https://acme.example";
const ACTION = "7f".repeat(21);

/** The form's call as React's client encodes it. */
function actionForm(name = "Test"): FormData {
  const form = new FormData();
  form.set("_1_name", name);
  form.set("_1_mobile", "0500000000");
  form.set("0", '[null,"$K1"]');
  return form;
}

function call(
  body: BodyInit,
  headers: Record<string, string> = {},
  { action = true, method = "POST" } = {},
): Request {
  return new Request(SITE, {
    body,
    headers: {
      host: "api-gateway.example",
      origin: SITE,
      "x-forwarded-host": "acme.example",
      ...(action ? { "next-action": ACTION } : {}),
      ...headers,
    },
    method,
  });
}

describe("foreignOrigin (Next's CSRF check)", () => {
  const headers = (h: Record<string, string>) => new Headers(h);

  it("the distribution's host passes; another site, null or garbage does not", () => {
    const own = { host: "gw.example", "x-forwarded-host": "acme.example" };
    expect(foreignOrigin(headers({ ...own, origin: SITE }))).toBe(false);
    for (const origin of ["https://evil.example", "null", "not a url", "https://gw.example"]) {
      expect(foreignOrigin(headers({ ...own, origin }))).toBe(true);
    }
  });

  it("Host stands in without x-forwarded-host (next start); no Origin passes, as in Next", () => {
    expect(
      foreignOrigin(headers({ host: "localhost:3190", origin: "http://localhost:3190" })),
    ).toBe(false);
    expect(foreignOrigin(headers({ host: "localhost:3190" }))).toBe(false);
    expect(foreignOrigin(headers({ origin: SITE }))).toBe(true);
  });
});

describe("actionRefusal", () => {
  it("lets the form's own call through, and leaves the body for the action", async () => {
    const request = call(actionForm());
    expect(await actionRefusal(request)).toBeUndefined();
    expect((await request.formData()).get("_1_name")).toBe("Test");
  });

  it("lets a text reply through (React's encodeReply of simple values)", async () => {
    const request = call('["a",{"b":1}]', { "content-type": "text/plain;charset=UTF-8" });
    expect(await actionRefusal(request)).toBeUndefined();
  });

  it("refuses a foreign Origin with 403, before the body is read", async () => {
    expect(await actionRefusal(call(actionForm(), { origin: "https://evil.example" }))).toBe(403);
  });

  it("refuses a body over Next's 1 MB with 413, by its length or its bytes", async () => {
    expect(await actionRefusal(call(actionForm("x".repeat(2_000_000))))).toBe(413);
    // A stream has no content-length: the bytes are counted.
    const big = new TextEncoder().encode(`["${"x".repeat(ACTION_BODY_LIMIT)}"]`);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(big);
        controller.close();
      },
    });
    const request = new Request(SITE, {
      body: stream,
      duplex: "half",
      headers: { "next-action": ACTION, "content-type": "text/plain" },
      method: "POST",
    } as RequestInit);
    expect(await actionRefusal(request)).toBe(413);
  });

  it("lets a 300 KB name through: the action cuts it to its own limit", async () => {
    expect(await actionRefusal(call(actionForm("x".repeat(300_000))))).toBeUndefined();
  });

  it("refuses a body React could not decode with 400", async () => {
    const broken = new FormData();
    broken.set("0", '["$K9","$@1","$Q2"]');
    const noRoot = new FormData();
    noRoot.set("_1_name", "x");
    const nestedMissing = new FormData();
    nestedMissing.set("0", '["$1"]');
    nestedMissing.set("1", '{"a":"$@2"}');
    for (const request of [
      call("{{{not-a-form", { "content-type": "text/plain;charset=UTF-8" }),
      call('["$@1"]', { "content-type": "text/plain;charset=UTF-8" }),
      call(broken),
      call(noRoot),
      call(nestedMissing),
      call("--x\r\nbroken", { "content-type": "multipart/form-data; boundary=y" }),
    ]) {
      expect(await actionRefusal(request)).toBe(400);
    }
  });

  it("a reference to a part that is there, an escaped $ and a FormData are fine", async () => {
    const form = new FormData();
    form.set("0", '["$$1","$a","$K1"]');
    form.set("10", '{"x":"$Qa"}');
    form.set("_1_name", "y");
    expect(await actionRefusal(call(form))).toBeUndefined();
  });

  it("a form post without script is checked for its Origin and length only", async () => {
    const form = new FormData();
    form.set("$ACTION_ID_x", "");
    expect(await actionRefusal(call(form, {}, { action: false }))).toBeUndefined();
    expect(
      await actionRefusal(call(form, { origin: "https://evil.example" }, { action: false })),
    ).toBe(403);
  });

  it("leaves every request that is not an action alone", async () => {
    const get = new Request(SITE, { headers: { origin: "https://evil.example" } });
    expect(await actionRefusal(get)).toBeUndefined();
    const plain = call(
      "x",
      { origin: "https://evil.example", "content-type": "text/plain" },
      {
        action: false,
      },
    );
    expect(await actionRefusal(plain)).toBeUndefined();
  });
});
