import type { ContractInput, ContractOutput, RouteContract } from "@acme/contracts";
import type { HttpHandler, HttpResponseResolver, JsonBodyType } from "msw";

import { http, HttpResponse } from "msw";

type Resolve<Contract extends RouteContract> = (
  input: Pick<ContractInput<Contract>, "params"> & { request: Request },
) => ContractOutput<Contract>;

// An MSW handler built from a contract:
//
//   mockRoute(contracts.public.listMessages)(() => ({ items: [], nextCursor: null }))
//
// Every mock response is parsed against the contract's output schema, so a
// mock cannot drift from the API: an out-of-date mock fails the test using it.
// (Two calls, so TypeScript fixes the contract before it types the resolver.)
export function mockRoute<Contract extends RouteContract>(contract: Contract) {
  return (resolve: Resolve<Contract>): HttpHandler => {
    const resolver: HttpResponseResolver = ({ params, request }) => {
      const output: unknown = resolve({
        params: params as ContractInput<Contract>["params"],
        request,
      });
      return HttpResponse.json(contract.output.parse(output) as JsonBodyType);
    };
    const method = contract.method.toLowerCase() as "delete" | "get" | "patch" | "post" | "put";
    return http[method](`*${contract.path}`, resolver);
  };
}
