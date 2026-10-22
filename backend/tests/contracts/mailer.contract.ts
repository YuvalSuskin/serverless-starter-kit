// The Mailer port's contract. Runs against the
// fake (unit) and against the SES adapter talking to a local stand-in of
// SES v2 (contract), from source and as bundled: there is no SES emulator.
import { describe, expect, it } from "vitest";

import type { Mailer, OutgoingEmail } from "../../src/domain/ports";
import type { RecordingLogger } from "../../src/fakes/logger";
import type { Metered } from "../support/recording-usage";

import { FAKE_REFUSED_ADDRESS } from "../../src/fakes/mailer";

/** What reached the provider for one email. */
export interface Delivered {
  bcc: readonly string[];
  cc: readonly string[];
  html: string;
  kind: string;
  replyTo: readonly string[];
  stream: string;
  subject: string;
  text: string;
  to: readonly string[];
}

export interface MailerHarness {
  /** Every email that reached the provider, in order. */
  delivered: () => readonly Delivered[];
  /** A mailer whose provider cannot be reached. */
  down: Mailer;
  log: RecordingLogger;
  mailer: Mailer;
  /** The usage the mailers record. */
  records: Metered[];
  /** A mailer on a stage whose email is off. */
  unavailable: Mailer;
}

/** The provider refuses this address, as SES refuses one it will not take (the stand-in too). */
export const REFUSED_ADDRESS = FAKE_REFUSED_ADDRESS;

export const anEmail = (overrides: Partial<OutgoingEmail> = {}): OutgoingEmail => ({
  html: '<html lang="en"><body><p>Hello</p></body></html>',
  kind: "contact_message",
  replyTo: "noa@example.test",
  stream: "team",
  subject: "New message from Noa",
  text: "Hello",
  to: "yoni@example.test",
  ...overrides,
});

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

export function mailerContract(
  name: string,
  harness: () => MailerHarness | Promise<MailerHarness>,
) {
  describe(`Mailer contract: ${name}`, () => {
    it("MAIL-R16: hands an accepted email over, whole, and resolves", async () => {
      const { delivered, mailer } = await harness();
      const email = anEmail();
      await mailer.send(email);
      expect(delivered().at(-1)).toEqual({
        bcc: [],
        cc: [],
        html: email.html,
        kind: "contact_message",
        replyTo: [email.replyTo],
        stream: "team",
        subject: email.subject,
        text: email.text,
        to: [email.to],
      });
    });

    it("MAIL-R12: sends to one address, copying no one", async () => {
      const { delivered, mailer } = await harness();
      await mailer.send(anEmail({ to: "maya@example.test" }));
      const last = delivered().at(-1);
      expect(last?.to).toEqual(["maya@example.test"]);
      expect([...(last?.cc ?? []), ...(last?.bcc ?? [])]).toEqual([]);
    });

    it("MAIL-R7: a subject and body in other scripts arrive intact", async () => {
      const { delivered, mailer } = await harness();
      const subject = "Réservation de Zoë & 你好 ✓";
      await mailer.send(anEmail({ subject, text: "Merci beaucoup… 谢谢" }));
      expect(delivered().at(-1)?.subject).toBe(subject);
      expect(delivered().at(-1)?.text).toBe("Merci beaucoup… 谢谢");
    });

    it("meters email.sent once per email the provider accepted", async () => {
      const { mailer, records } = await harness();
      const before = records.length;
      await mailer.send(anEmail());
      await mailer.send(anEmail({ to: "maya@example.test" }));
      expect(records.slice(before)).toEqual([
        { meter: "email.sent", quantity: 1 },
        { meter: "email.sent", quantity: 1 },
      ]);
    });

    it("rejects an address the provider refuses as email_refused, and meters nothing", async () => {
      const { mailer, records } = await harness();
      const before = records.length;
      expect(await codeOf(mailer.send(anEmail({ to: REFUSED_ADDRESS })))).toBe("email_refused");
      expect(records.slice(before)).toEqual([]);
    });

    it("rejects as email_unavailable when the provider cannot be reached, and meters nothing", async () => {
      const { down, records } = await harness();
      const before = records.length;
      expect(await codeOf(down.send(anEmail()))).toBe("email_unavailable");
      expect(records.slice(before)).toEqual([]);
    });

    it("sends nothing on a stage whose email is off", async () => {
      const { delivered, unavailable } = await harness();
      const before = delivered().length;
      expect(unavailable.available).toBe(false);
      expect(await codeOf(unavailable.send(anEmail()))).toBe("email_unavailable");
      expect(delivered()).toHaveLength(before);
    });

    it("never logs the address, the reply address or the subject", async () => {
      const { down, log, mailer } = await harness();
      const email = anEmail({ replyTo: "reply-secret@example.test", to: "secret@example.test" });
      await mailer.send(email);
      await mailer.send({ ...email, to: REFUSED_ADDRESS }).catch(() => undefined);
      await down.send(email).catch(() => undefined);
      const logged = JSON.stringify(log.lines);
      expect(logged).not.toContain("secret@example.test");
      expect(logged).not.toContain("reply-secret");
      expect(logged).not.toContain(REFUSED_ADDRESS);
      expect(logged).not.toContain(email.subject);
    });
  });
}
