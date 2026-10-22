import { build } from "esbuild";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildPath, type RouteDescriptor, routes } from "./client";

// No skeleton route has a path parameter, so the helper is exercised on a
// descriptor of its own.
const thing: RouteDescriptor = {
  audience: "public",
  method: "GET",
  path: "/api/public/things/:thingId/parts",
};

describe("buildPath", () => {
  it("encodes each parameter as one path segment", () => {
    expect(buildPath(thing, { thingId: "a/b?c" })).toBe("/api/public/things/a%2Fb%3Fc/parts");
  });

  // encodeURIComponent leaves these alone, and the URL parser then collapses
  // them: /things/../parts would call /api/public/parts.
  it.each(["", ".", ".."])("refuses %j, which would not stay one segment", (thingId) => {
    expect(() => buildPath(thing, { thingId })).toThrow(/path parameter/);
  });
});

// The table is split into one file per audience and composed here: the
// composition is every route's name, method and path.
it("composes every route, with its name, method and path, as the one table did", () => {
  const rows = Object.entries<Readonly<Record<string, RouteDescriptor>>>(routes).flatMap(
    ([audience, group]) =>
      Object.entries(group).map(
        ([name, route]) => `${audience}.${name} ${route.method} ${route.path} ${route.audience}`,
      ),
  );
  expect(rows).toMatchSnapshot();
});

// What a bundle of one entry holds: the files that put code into it.
async function bundledInputs(entry: string) {
  const result = await build({
    bundle: true,
    entryPoints: [path.join(import.meta.dirname, entry)],
    format: "esm",
    metafile: true,
    platform: "browser",
    write: false,
  });
  const inputs = Object.values(result.metafile.outputs).flatMap((output) =>
    Object.entries(output.inputs)
      .filter(([, used]) => used.bytesInOutput > 0)
      .map(([input]) => input),
  );
  return { inputs, text: result.outputFiles.map((file) => file.text).join("\n") };
}

// The whole point of this entry: the frontend imports values only
// from here, so zod must never reach it, even through a helper.
it("bundles without any of zod", async () => {
  const { inputs } = await bundledInputs("client.ts");
  expect(inputs.length).toBeGreaterThan(0);
  expect(inputs.filter((input) => input.includes("zod"))).toEqual([]);
});

// A page that calls one audience imports that audience's table and the core,
// and the other audiences' routes never reach its bundle.
describe("the route-free core and one table per audience", () => {
  it("core names no route", async () => {
    const { text } = await bundledInputs("client/core.ts");
    expect(text).not.toContain("/api/");
  });

  it.each([["public", "client/public.ts"]])(
    "the %s table holds only its own routes",
    async (_audience, entry) => {
      const { inputs } = await bundledInputs(entry);
      // The core adds no bytes of its own to a table (it holds types), so the
      // table's file is the only one in the bundle; never another audience's.
      expect(inputs.map((input) => path.basename(input))).toEqual([path.basename(entry)]);
    },
  );
});
