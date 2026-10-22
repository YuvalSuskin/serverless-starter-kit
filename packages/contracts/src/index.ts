import type { RouteContract } from "./define-contract";

import { publicRoutes } from "./routes/public";

export {
  type Audience,
  buildPath,
  CORRELATION_ID_HEADER,
  type Method,
  ORIGIN_SECRET_HEADER,
  pathParams,
  type RouteDescriptor,
  routes,
  VIEWER_ADDRESS_HEADER,
} from "./client";
export {
  type ContractInput,
  type ContractOutput,
  defineContract,
  type RouteContract,
} from "./define-contract";
export { ErrorBody, ErrorCode, PUBLIC_INPUT_ROUTE_ERRORS, PUBLIC_ROUTE_ERRORS } from "./errors";
export { Message, NewMessage } from "./message";
export { page, type Page } from "./page";

// Every route, grouped by audience. The backend's completeness sweep checks
// that each one has exactly one implementation.
export const contracts = { public: publicRoutes } as const;

const groups: Record<string, Record<string, RouteContract>> = contracts;

export const allContracts: readonly RouteContract[] = Object.values(groups).flatMap((group) =>
  Object.values(group),
);
