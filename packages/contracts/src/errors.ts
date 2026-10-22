import * as z from "zod";

// Errors carry a code, never user-facing text: the frontend turns each code
// into a whole sentence.
export const ErrorCode = z.enum([
  "invalid",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "payload_too_large",
  "unsupported_media_type",
  "internal",
  // Too many requests from one address, or a WAF rate rule. Answered with 429.
  "rate_limited",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

// Every error response has this body. `correlationId` is always present, so a
// user's "it broke" can be traced to the logs. `details` lists
// which input fields failed and how (a zod issue code, not prose).
export const ErrorBody = z.object({
  code: ErrorCode,
  correlationId: z.string(),
  details: z.array(z.object({ issue: z.string(), path: z.string() })).optional(),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

// What the API itself can answer on any public route. Every contract lists at
// least its audience's set, so a client reading `errors` sees every code the
// API can give it (a test checks it). In production the WAF in front can also
// answer any /api/ path with 429 rate_limited; a client
// treats it as any other error. A new audience adds its own set beside this.
export const PUBLIC_ROUTE_ERRORS = [
  "payload_too_large",
  "internal",
] as const satisfies readonly ErrorCode[];

// A public route that takes input: a JSON body or a query it can refuse.
export const PUBLIC_INPUT_ROUTE_ERRORS = [
  ...PUBLIC_ROUTE_ERRORS,
  "invalid",
  "unsupported_media_type",
] as const satisfies readonly ErrorCode[];
