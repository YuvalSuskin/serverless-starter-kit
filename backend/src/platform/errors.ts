import type { ErrorCode } from "@acme/contracts";

// Use-cases throw these; api/errors.ts is the only place that maps them to
// HTTP. Each carries the contract's error code, never user text.
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;
}

export class NotFound extends DomainError {
  readonly code = "not_found";
}

export class Forbidden extends DomainError {
  readonly code = "forbidden";
}

/**
 * The change cannot be made as things stand. `details` says why, as a code
 * the frontend turns into a sentence (a stale version, a thing that has
 * closed): one conflict can have several causes the screen tells apart.
 */
export class Conflict extends DomainError {
  readonly code = "conflict";

  constructor(
    message: string,
    readonly details: { issue: string; path: string }[] = [],
  ) {
    super(message);
  }
}

export class Unauthenticated extends DomainError {
  readonly code = "unauthenticated";
}

/** Input that failed validation. `details` says which fields and how. */
export class Invalid extends DomainError {
  readonly code = "invalid";

  constructor(
    message: string,
    readonly details: { issue: string; path: string }[] = [],
  ) {
    super(message);
  }
}

export class PayloadTooLarge extends DomainError {
  readonly code = "payload_too_large";
}

/** A caller past a request limit. */
export class RateLimited extends DomainError {
  readonly code = "rate_limited";
}

/** A request body that is not JSON: refused so a form cannot post to the API. */
export class UnsupportedMediaType extends DomainError {
  readonly code = "unsupported_media_type";
}

/**
 * An email that was not handed over for delivery (EM2). Not a DomainError: no route answers it; the caller says "not sent".
 * `email_refused`: the provider said no to this email. `email_unavailable`:
 * it could not be asked, or the stage sends no email. `email_blocked`: it
 * refused the stage itself (sending paused, access denied, the sender not
 * verified): no email goes until that is fixed (EM23).
 */
export class EmailNotSent extends Error {
  constructor(readonly code: "email_blocked" | "email_refused" | "email_unavailable") {
    super(code);
    this.name = "EmailNotSent";
  }
}
