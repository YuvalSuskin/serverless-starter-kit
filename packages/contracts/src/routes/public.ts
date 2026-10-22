import * as z from "zod";

import { routes } from "../client";
import { defineContract } from "../define-contract";
import { PUBLIC_INPUT_ROUTE_ERRORS, PUBLIC_ROUTE_ERRORS } from "../errors";
import { Message, NewMessage } from "../message";
import { page } from "../page";

export const publicRoutes = {
  health: defineContract({
    ...routes.public.health,
    errors: [...PUBLIC_ROUTE_ERRORS],
    input: { body: z.undefined(), params: z.object({}), query: z.object({}) },
    output: z.object({ status: z.literal("ok") }),
  }),

  // Skeleton: the template's demo routes, replaced by bootstrap step 6.
  // The newest messages first. Query values arrive as text, so limit is coerced.
  listMessages: defineContract({
    ...routes.public.listMessages,
    errors: [...PUBLIC_INPUT_ROUTE_ERRORS],
    input: {
      body: z.undefined(),
      params: z.object({}),
      query: z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }),
    },
    output: page(Message),
  }),

  // A visitor's message: stored, and mailed to the owner.
  sendMessage: defineContract({
    ...routes.public.sendMessage,
    errors: [...PUBLIC_INPUT_ROUTE_ERRORS],
    input: { body: NewMessage, params: z.object({}), query: z.object({}) },
    output: Message,
  }),
} as const;
