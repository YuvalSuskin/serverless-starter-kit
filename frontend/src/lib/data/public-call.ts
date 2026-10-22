import type { ContractInput, ContractOutput, contracts } from "@acme/contracts";

import { publicRoutes } from "@acme/contracts/client/public";

import { call, type CallOptions, type ContractOf } from "./api-client";

// The way to call a public route (health, sign-in): nobody is signed in yet.
// It imports the public routes only.

type Name = keyof typeof contracts.public;

export function publicCall<N extends Name>(
  name: N,
  input: ContractInput<ContractOf<"public", N>>,
  options: CallOptions = {},
): Promise<ContractOutput<ContractOf<"public", N>>> {
  return call<ContractOf<"public", N>>(publicRoutes[name], input, options);
}
