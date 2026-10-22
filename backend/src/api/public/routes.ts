import { contracts } from "@acme/contracts";
import { Hono } from "hono";

import type { ApiEnv, AppDeps, Route } from "../http/types";

import { DEMO_UNIT } from "../../domain/messages";
import { listMessages } from "../../domain/messages/list-messages";
import { sendMessage } from "../../domain/messages/send-message";
import { extendLogContext } from "../../platform/log-context";
import { definePublicRoute } from "../http/define-route";

export const publicRoutes: readonly Route[] = [
  // The bundle smoke test's target.
  definePublicRoute({
    contract: contracts.public.health,
    handler: () => ({ status: "ok" as const }),
  }),

  // Skeleton: the template's demo routes, replaced by bootstrap step 6.
  // Both belong to the one demo unit, so their meters attribute to it.
  definePublicRoute({
    contract: contracts.public.listMessages,
    example: { body: undefined, params: {}, query: {} },
    handler: (deps, input) => {
      extendLogContext({ unitId: DEMO_UNIT });
      return listMessages(deps, input.query);
    },
  }),

  definePublicRoute({
    contract: contracts.public.sendMessage,
    example: {
      body: { body: "Hello", email: "visitor@example.test", name: "Visitor" },
      params: {},
      query: {},
    },
    handler: (deps, input) => {
      extendLogContext({ unitId: DEMO_UNIT });
      return sendMessage(
        {
          ...deps.platform,
          mailer: deps.mailer,
          messages: deps.messages,
          ownerAddress: deps.ownerAddress,
        },
        input.body,
      );
    },
  }),
];

export function createPublicApi(deps: AppDeps): Hono<ApiEnv> {
  const api = new Hono<ApiEnv>();
  for (const route of publicRoutes) route.register(api, deps);
  return api;
}
