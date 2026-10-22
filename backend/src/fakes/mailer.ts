import type { Mailer, OutgoingEmail } from "../domain/ports";
import type { Logger } from "../platform/logger";
import type { Usage } from "../platform/usage";

import { EmailNotSent } from "../platform/errors";

/** The fake refuses this address, as SES refuses one it will not take. */
export const FAKE_REFUSED_ADDRESS = "refused@example.test";

/** How many emails the fake keeps: the dev server runs for hours (EM13). */
const KEPT = 50;

export interface FakeMailer extends Mailer {
  /** The emails accepted, oldest first, at most the last fifty. */
  readonly sent: readonly (OutgoingEmail & { at: string })[];
}

/**
 * The dev server's and the tests' mailer: it
 * sends nothing and keeps what it accepted, which `/api/dev-mail` shows. It
 * behaves as the SES adapter does, metering `email.sent` once per accepted
 * email and logging no address or subject; the suite in
 * tests/contracts/mailer.contract.ts runs against both.
 */
export function fakeMailer({
  available = true,
  fails = false,
  log,
  now = () => new Date(),
  usage,
}: {
  available?: boolean;
  /** The provider cannot be reached. */
  fails?: boolean;
  log?: Logger;
  now?: () => Date;
  usage: Usage;
}): FakeMailer {
  const sent: (OutgoingEmail & { at: string })[] = [];
  return {
    available,
    send: (email) => {
      if (!available || fails) return Promise.reject(new EmailNotSent("email_unavailable"));
      if (email.to === FAKE_REFUSED_ADDRESS) {
        log?.warn("email refused", { kind: email.kind, stream: email.stream });
        return Promise.reject(new EmailNotSent("email_refused"));
      }
      sent.push({ ...email, at: now().toISOString() });
      if (sent.length > KEPT) sent.shift();
      usage.record("email.sent");
      log?.info("email sent", { kind: email.kind, stream: email.stream });
      return Promise.resolve();
    },
    sent,
  };
}
