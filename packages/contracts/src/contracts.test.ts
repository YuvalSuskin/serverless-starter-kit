// Invariants every contract must keep. New contracts are checked
// automatically: they only need to be exported from a routes/ file.
import { describe, expect, it } from "vitest";

import type { RouteContract } from "./define-contract";

import { pathParams, type RouteDescriptor, routes } from "./client";
import { allContracts, contracts, PUBLIC_ROUTE_ERRORS } from "./index";

const cases = allContracts.map(
  (contract) => [`${contract.method} ${contract.path}`, contract] as const,
);

describe.each(cases)("%s", (_, contract) => {
  it("lives under /api/", () => {
    expect(contract.path).toMatch(/^\/api\//);
  });

  // The API can answer any of these on a public route; a client reading
  // `errors` must see them. A new audience adds its own set here.
  it("lists every error its audience can return", () => {
    const byAudience = { public: PUBLIC_ROUTE_ERRORS }[contract.audience];
    expect(contract.errors).toEqual(expect.arrayContaining([...byAudience]));
  });

  it("declares exactly the parameters its path uses", () => {
    expect(new Set(Object.keys(contract.input.params.shape))).toEqual(
      new Set(pathParams(contract.path)),
    );
  });
});

it("has no two contracts for the same method and path", () => {
  const taken = allContracts.map((contract) => `${contract.method} ${contract.path}`);
  expect(new Set(taken).size).toBe(taken.length);
});

it("has exactly one contract per entry in the zod-free route table, and back", () => {
  const table: Record<string, Record<string, RouteDescriptor>> = routes;
  const groups: Record<string, Record<string, RouteContract>> = contracts;
  const entries = Object.entries(table).flatMap(([audience, group]) =>
    Object.entries(group).map(([name, route]) => ({ audience, name, route })),
  );
  for (const { audience, name, route } of entries) {
    expect(groups[audience]?.[name]).toMatchObject(route);
  }
  expect(allContracts).toHaveLength(entries.length);
});
