// The zod-free half of the contracts: what the
// browser needs at runtime to call a route -- its method and path -- and
// nothing that would pull zod into a page bundle. The frontend imports VALUES
// only from here ("@acme/contracts/client"); from the main entry it
// imports types only, and lint enforces that. Every contract in routes/
// spreads its entry from this table, so method and path are written once.
//
// The table is composed from one file per audience, over a route-free core.
// A page that calls one audience imports that audience's file and
// `client/core`, so the other audiences' routes stay out of its bundle; this
// whole table is for the backend, the contracts and tests.

import type { Audience, RouteDescriptor } from "./client/core";

import { publicRoutes } from "./client/public";

export * from "./client/core";

export const routes = {
  public: publicRoutes,
} as const satisfies Record<Audience, Record<string, RouteDescriptor>>;
