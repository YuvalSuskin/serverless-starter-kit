import type { z } from "zod";

import type { RouteDescriptor } from "./client";
import type { ErrorCode } from "./errors";

// One HTTP route, described once and shared: the backend implements it with
// definePublicRoute, the frontend calls it with publicCall, and MSW mocks it
// with mockRoute. Method, path and audience come from the zod-free route
// table in client.ts; every input part is spelled out, even when empty.
export interface RouteContract<
  Params extends z.ZodObject = z.ZodObject,
  Query extends z.ZodObject = z.ZodObject,
  Body extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
> extends RouteDescriptor {
  readonly errors: readonly ErrorCode[];
  readonly input: { readonly body: Body; readonly params: Params; readonly query: Query };
  readonly output: Output;
}

export interface ContractInput<Contract extends RouteContract> {
  body: z.infer<Contract["input"]["body"]>;
  params: z.infer<Contract["input"]["params"]>;
  query: z.infer<Contract["input"]["query"]>;
}

export type ContractOutput<Contract extends RouteContract> = z.infer<Contract["output"]>;

export function defineContract<const Contract extends RouteContract>(contract: Contract): Contract {
  return contract;
}
