// Written once, applied to every registered route. A new route is
// covered the moment it is registered; do not write per-route tests of what
// is checked here.
import { allContracts, CORRELATION_ID_HEADER } from "@acme/contracts";
import { describe, expect, it } from "vitest";

import type { Route } from "../../src/api/http/types";

import { allRoutes } from "../../src/api/app/create-app";
import { type Input, testApp } from "../support/test-app";

const named = (routes: readonly Route[]) =>
  routes.map((route) => [`${route.contract.method} ${route.contract.path}`, route] as const);

const exampleFor = (route: Route): Input => route.example() as Input;

describe("contract completeness", () => {
  it("every contract has exactly one route", () => {
    const implemented = allRoutes.map((route) => route.contract);
    for (const contract of allContracts) {
      expect(
        implemented.filter((c) => c === contract),
        `${contract.method} ${contract.path}`,
      ).toHaveLength(1);
    }
  });

  it("every route implements a contract", () => {
    for (const route of allRoutes) expect(allContracts).toContain(route.contract);
  });

  // The sweeps cover the registry. A handler registered straight on Hono
  // (api.get(...)) would skip them all -- and could reach unscoped stores --
  // so everything Hono serves must be a registered route. ALL entries are
  // middleware.
  // app.all(...) registers a handler as an ALL entry, which would hide among
  // the middleware. Only these ALL entries may exist.
  it("has no ALL handler beyond the known middleware", () => {
    const { app } = testApp();
    const all = app.routes.filter((route) => route.method === "ALL").map((route) => route.path);
    expect(new Set(all)).toEqual(new Set(["/*", "/api/*"]));
  });

  it("Hono serves nothing but registered routes, so nothing escapes the sweeps", () => {
    const { app } = testApp();
    const served = app.routes
      .filter((route) => route.method !== "ALL")
      .map((route) => `${route.method} ${route.path}`);
    const registered = allRoutes.map((route) => `${route.contract.method} ${route.contract.path}`);
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(served.toSorted(byName)).toEqual(registered.toSorted(byName));
  });
});

describe.each(named(allRoutes))("%s", (_, route) => {
  it("accepts its example and returns the contract's output", async () => {
    const { send } = testApp();
    const response = await send(route, exampleFor(route));
    expect(response.status).toBe(200);
    expect(route.contract.output.safeParse(await response.json()).success).toBe(true);
  });

  it("logs the correlation id and the stage on every line", async () => {
    const { log, send } = testApp();
    const response = await send(route, exampleFor(route));
    const id = response.headers.get(CORRELATION_ID_HEADER);
    expect(log.lines.length).toBeGreaterThan(0);
    for (const line of log.lines) {
      expect(line.fields).toMatchObject({ correlationId: id, stage: "test" });
    }
  });

  // Usage feeds the per-unit cost (root CLAUDE.md): a route that meters a call
  // names the unit it is for, and a line without one would have thrown.
  it("attributes every usage line it writes to a unit", async () => {
    const { log, send } = testApp();
    await send(route, exampleFor(route));
    const usage = log.lines.filter((line) => line.fields.type === "usage");
    for (const line of usage) expect(line.fields.unitId).toEqual(expect.any(String));
  });

  // An answer that does not say how it is cached is never kept by a shared cache.
  it("answers with Cache-Control: no-store unless it says otherwise", async () => {
    const { send } = testApp();
    const response = await send(route, exampleFor(route));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

// A text/plain or form body is a "simple" request that a browser sends
// cross-site without a preflight: no route reads one.
describe.each(
  named(allRoutes.filter((route) => ["PATCH", "POST", "PUT"].includes(route.contract.method))),
)("%s", (_, route) => {
  it("refuses a body that is not JSON with 415", async () => {
    const { app } = testApp();
    const response = await app.request(route.contract.path, {
      body: JSON.stringify(exampleFor(route).body),
      headers: { "content-type": "text/plain" },
      method: route.contract.method,
    });
    expect(response.status).toBe(415);
    expect(route.contract.errors).toContain("unsupported_media_type");
  });
});
