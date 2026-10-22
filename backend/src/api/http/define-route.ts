import type { ContractInput, ContractOutput, RouteContract } from "@acme/contracts";
import type { Context } from "hono";
import type { z } from "zod";

import type { AppDeps, Route } from "./types";

import { Invalid, UnsupportedMediaType } from "../../platform/errors";
import { extendLogContext } from "../../platform/log-context";

type Awaitable<T> = Promise<T> | T;

// A route with no principal and no unit of its own, such as /api/health or
// the skeleton's contact messages. It takes the whole app's deps, since a
// public route has no scope to narrow them to, and its input is parsed in
// order, each part refused with 400 if the contract refuses it:
//   1. path params, query and body
//   2. the handler
//   3. the output, parsed in production too: undeclared fields are dropped
// A route that is about one unit sets it (`extendLogContext({ unitId })`) in
// its handler, before it records usage.
export function definePublicRoute<
  const Contract extends RouteContract & { readonly audience: "public" },
>(spec: {
  contract: Contract;
  /** The input the registry's examples send; none for a route that takes none. */
  example?: ContractInput<Contract>;
  handler: (deps: AppDeps, input: ContractInput<Contract>) => Awaitable<ContractOutput<Contract>>;
}): Route {
  const { contract, handler } = spec;
  return {
    contract,
    example: () => spec.example ?? { body: undefined, params: {}, query: {} },
    register(app, deps) {
      app.on(contract.method, contract.path, async (c) => {
        extendLogContext({ route: `${contract.method} ${contract.path}` });
        const input = {
          body: parse(contract.input.body, await readBody(c), "body"),
          params: parse(contract.input.params, c.req.param(), "params"),
          query: parse(contract.input.query, c.req.query(), "query"),
        } as ContractInput<Contract>;
        return c.json(contract.output.parse(await handler(deps, input)));
      });
    },
  };
}

function parse<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
  part: string,
): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => ({
    issue: issue.code,
    path: [part, ...issue.path.map(String)].join("."),
  }));
  throw new Invalid(`invalid ${part}`, details);
}

// Only JSON bodies are read. A text/plain or form body is a "simple" request
// that a browser sends cross-site without a preflight; refusing it keeps
// cookie-authenticated POST routes safe from forms on other sites.
async function readBody(c: Context): Promise<unknown> {
  if (c.req.method === "GET" || c.req.method === "DELETE") return undefined;
  const text = await c.req.text();
  if (text === "") return undefined;
  const mediaType = (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") throw new UnsupportedMediaType(mediaType ?? "");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Invalid("body is not JSON", [{ issue: "invalid_json", path: "body" }]);
  }
}
