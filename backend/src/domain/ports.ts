import type { Message } from "@acme/contracts";

// The interfaces domain code depends on. Real implementations live in
// src/adapters/, fakes in src/fakes/, and each port has one contract suite in
// tests/contracts/ that both must pass.

/**
 * Which stream an email goes through, which decides what the provider
 * suppresses: `team`, mail to the team's own
 * people, honours bounces and complaints; `notices`, mail a system sends on
 * its own schedule, honours bounces only (MAIL-R10, MAIL-R17).
 */
export type EmailStream = "notices" | "team";

/**
 * What an email is, for the logs, the meter and SES's tags: letters, digits
 * and `_` only, the characters an SES tag value takes. A kind is added here
 * with the email that uses it.
 */
type EmailKind = "contact_message";

/** One email to one address (MAIL-R12): never a list, never a copy to anyone else. */
export interface OutgoingEmail {
  html: string;
  kind: EmailKind;
  /** Where a reply goes (MAIL-R5, MAIL-R6). */
  replyTo: string;
  stream: EmailStream;
  subject: string;
  /** The same email as text alone (MAIL-R9). */
  text: string;
  to: string;
}

/**
 * The app's emails. `send` resolves once the
 * provider accepted the email for delivery (MAIL-R16) and meters it
 * (`email.sent`); it rejects with `EmailNotSent` otherwise, `email_refused`
 * when the provider said no to this email, `email_unavailable` when it could
 * not be asked. The address, the subject and the body are never logged.
 */
export interface Mailer {
  /** False on a stage whose email is off: `send` then rejects at once, asking no one. */
  readonly available: boolean;
  send(email: OutgoingEmail): Promise<void>;
}

/**
 * Skeleton: the template's demo port, replaced by bootstrap step 6.
 * The contact messages visitors sent, all of one unit (`DEMO_UNIT`).
 */
export interface MessageStore {
  /**
   * The newest `limit` messages, newest first; `limit` is at least 1 (the
   * contract refuses less). Messages sent in the same millisecond are ordered
   * by id, descending, in every implementation.
   */
  list(limit: number): Promise<Message[]>;
  put(message: Message): Promise<void>;
}
