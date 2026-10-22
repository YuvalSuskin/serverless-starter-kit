import { describe, expect, it } from "vitest";

import {
  Conflict,
  DomainError,
  Forbidden,
  Invalid,
  NotFound,
  PayloadTooLarge,
  RateLimited,
  Unauthenticated,
  UnsupportedMediaType,
} from "./errors";

describe("domain errors", () => {
  it.each([
    [new NotFound("message"), "not_found"],
    [new Forbidden("messages.read"), "forbidden"],
    [new Conflict("stale version"), "conflict"],
    [new Unauthenticated("sign-in required"), "unauthenticated"],
    [new PayloadTooLarge("too big"), "payload_too_large"],
    [new UnsupportedMediaType("text/plain"), "unsupported_media_type"],
    [new Invalid("bad input"), "invalid"],
    [new RateLimited("too many requests"), "rate_limited"],
  ] as const)("%s carries the contract's error code", (error, code) => {
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe(code);
  });

  it("names which fields were invalid and how, never in prose", () => {
    const error = new Invalid("invalid params", [
      { issue: "invalid_format", path: "params.messageId" },
    ]);
    expect(error.details).toEqual([{ issue: "invalid_format", path: "params.messageId" }]);
  });
});
