import type {
  ContractInput,
  ContractOutput,
  contracts,
  ErrorBody,
  ErrorCode,
  RouteContract,
} from "@acme/contracts";
import type { RouteDescriptor } from "@acme/contracts/client/core";

import { buildPath } from "@acme/contracts/client/core";

// The route-free half of the only way the frontend calls the backend: the request itself, the error it can end in and the
// types of a call. It names no route. A route is named by an audience's entry
// point (`publicCall`, public-call.ts), which imports its own audience's table
// only, so a page's bundle holds no other audience's routes. Only
// src/lib/data/ may import any of them; lint enforces that.
//
// Values come from "@acme/contracts/client/core", which has no zod and no
// route; the contracts themselves are imported as TYPES only. Importing a
// contract value here would pull zod into every page bundle that fetches data
// (measured: a page's client JS went from 23 KB to 141 KB).

type Contracts = typeof contracts;
export type ContractOf<
  A extends keyof Contracts,
  N extends keyof Contracts[A],
> = Contracts[A][N] extends RouteContract ? Contracts[A][N] : never;

/** A refused or failed call. `code` picks the sentence to show; it is never shown as is. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly correlationId: string,
    /** Which input fields were refused, and why: a code, never prose (ErrorBody). */
    readonly details: ErrorBody["details"] = [],
  ) {
    super(`${code} (${status.toString()}), correlation id ${correlationId}`);
  }
}

export interface CallOptions {
  /** Absolute origin for server components; the browser uses same-origin /api. */
  baseUrl?: string;
  /** Headers a server component passes on for the visitor. */
  forward?: Record<string, string>;
  /** The request outlives the page: for a change made as the page closes. */
  keepalive?: boolean;
  signal?: AbortSignal;
}

// Builds and sends one request. Everything the backend reads comes from here:
// method and path from the route the caller's table gave.
async function send(
  route: RouteDescriptor,
  input: { body: unknown; params: unknown; query: unknown },
  options: CallOptions,
): Promise<Response> {
  const params = input.params as Record<string, string>;
  const query = input.query as Record<string, boolean | number | string | undefined>;
  const url = new URL(buildPath(route, params), options.baseUrl ?? window.location.origin);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const body = input.body === undefined ? undefined : JSON.stringify(input.body);
  const headers: Record<string, string> = { ...options.forward, accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(url, {
    body,
    credentials: "same-origin",
    headers,
    keepalive: options.keepalive,
    method: route.method,
    // A page's URL may carry a secret: a Referer would copy it into the API's
    // access logs.
    referrerPolicy: "no-referrer",
    signal: options.signal,
  });
}

async function failure(response: Response): Promise<ApiError> {
  const error = (await response.json().catch(() => undefined)) as ErrorBody | undefined;
  return new ApiError(
    response.status,
    error?.code ?? "internal",
    error?.correlationId ?? "unknown",
    error?.details ?? [],
  );
}

// The response is not re-validated here: the backend already parsed it
// against the contract. Tests validate every mock with mockRoute instead.
export async function call<C extends RouteContract>(
  route: RouteDescriptor,
  input: ContractInput<C>,
  options: CallOptions,
): Promise<ContractOutput<C>> {
  const response = await send(route, input, options);
  if (!response.ok) throw await failure(response);
  return (await response.json()) as ContractOutput<C>;
}
