import { describe, expect, it } from "vitest";

import { buildPath, pathParams } from "./client";

const route = {
  audience: "public",
  method: "GET",
  path: "/api/public/things/:thingId/parts/:partId",
} as const;

describe("pathParams", () => {
  it("lists the :name segments in order", () => {
    expect(pathParams(route.path)).toEqual(["thingId", "partId"]);
  });

  it("is empty for a path without parameters", () => {
    expect(pathParams("/api/health")).toEqual([]);
  });
});

describe("buildPath", () => {
  it("fills parameters", () => {
    expect(buildPath(route, { partId: "p1", thingId: "abc" })).toBe(
      "/api/public/things/abc/parts/p1",
    );
  });

  it("URL-encodes them, so a value cannot add path segments", () => {
    expect(buildPath(route, { partId: "p", thingId: "../x y" })).toBe(
      "/api/public/things/..%2Fx%20y/parts/p",
    );
  });

  it("throws when a parameter is missing", () => {
    expect(() => buildPath(route, { partId: "p" })).toThrow(/:thingId/);
  });
});
