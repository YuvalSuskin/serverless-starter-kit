// The public routes: health and the skeleton's contact messages. Imports only ./core.

import type { RouteDescriptor } from "./core";

export const publicRoutes = {
  health: { audience: "public", method: "GET", path: "/api/health" },
  // Skeleton: the template's demo routes, replaced by bootstrap step 6.
  listMessages: { audience: "public", method: "GET", path: "/api/public/messages" },
  sendMessage: { audience: "public", method: "POST", path: "/api/public/messages" },
} as const satisfies Record<string, RouteDescriptor>;
