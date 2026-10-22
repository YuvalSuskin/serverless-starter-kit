import type { SESv2ClientConfig } from "@aws-sdk/client-sesv2";

import type { EmailStream, Mailer } from "../../domain/ports";
import type { Logger } from "../../platform/logger";
import type { Usage } from "../../platform/usage";

import { EmailNotSent } from "../../platform/errors";
import { currentLogContext } from "../../platform/log-context";
import { once } from "../../platform/once";

// Loaded on the first email, not at the API's cold start.
const sesv2 = once(() => import("@aws-sdk/client-sesv2"));

/** The stage's sending setup. */
export interface SesMailerConfig {
  /** One configuration set per stream. */
  configurationSets: Readonly<Record<EmailStream, string>>;
  /** The sender's address (MAIL-R2). */
  from: string;
  /** The name the sender shows, the app's (config's `EMAIL_FROM_NAME`, `Acme` by default). */
  fromName: string;
  /**
   * Domains whose addresses are never mailed: test accounts', which no
   * mailbox answers. Such an email resolves at once, unsent and unmetered,
   * logged as skipped. None on production.
   */
  neverMail?: readonly string[];
}

// The recipient's domain is one of `domains`, or under one.
function neverMailed(address: string, domains: readonly string[]): boolean {
  const domain = address.slice(address.lastIndexOf("@") + 1).toLowerCase();
  return domains.some((never) => domain === never || domain.endsWith(`.${never}`));
}

// SES's answers that say no to this one email: an address it will not take,
// a request it cannot read.
const REFUSED = new Set(["BadRequestException", "MessageRejected"]);
// SES's answers that say no to the stage (EM23): sending paused or suspended,
// the sender not verified, no access (the missing permissions boundary, or in
// the sandbox a recipient not verified). Anything else is SES not
// answering.
const BLOCKED = new Set([
  "AccessDeniedException",
  "AccountSuspendedException",
  "MailFromDomainNotVerifiedException",
  "NotFoundException",
  "SendingPausedException",
]);

function codeOf(name: string): EmailNotSent["code"] {
  if (REFUSED.has(name)) return "email_refused";
  return BLOCKED.has(name) ? "email_blocked" : "email_unavailable";
}

// An SES tag value takes letters, digits, `_` and `-` only.
const TAG_VALUE = /^[\w-]{1,256}$/;

const utf8 = (data: string) => ({ Charset: "UTF-8", Data: data });

/**
 * Amazon SES v2's SendEmail in the stage's region (EM1, EM4): one address per message (MAIL-R12), the subject and both bodies
 * in UTF-8, the stream's configuration set (its suppression, no tracking),
 * and tags naming the email's kind and unit. At most two attempts, a 1 s
 * connection and a 3 s request timeout, so a request's wait stays well
 * inside the API's own timeout. Metered `email.sent` only once SES accepted
 * the email; logged by kind, stream and SES's id, never by address.
 */
export function sesMailer(
  config: SesMailerConfig,
  usage: Usage,
  log: Logger,
  clientConfig: SESv2ClientConfig = {},
): Mailer {
  const client = once(
    async () =>
      new (await sesv2()).SESv2Client({
        maxAttempts: 2,
        requestHandler: { connectionTimeout: 1000, requestTimeout: 3000 },
        ...clientConfig,
      }),
  );
  return {
    available: true,
    async send(email) {
      if (neverMailed(email.to, config.neverMail ?? [])) {
        log.info("email skipped", { kind: email.kind, reason: "never_mail", stream: email.stream });
        return;
      }
      const unitId = currentLogContext()?.unitId;
      const tags = [
        { Name: "kind", Value: email.kind },
        ...(unitId !== undefined && TAG_VALUE.test(unitId)
          ? [{ Name: "unitId", Value: unitId }]
          : []),
      ];
      let messageId: string | undefined;
      try {
        const { SendEmailCommand } = await sesv2();
        const answer = await (
          await client()
        ).send(
          new SendEmailCommand({
            ConfigurationSetName: config.configurationSets[email.stream],
            Content: {
              Simple: {
                Body: { Html: utf8(email.html), Text: utf8(email.text) },
                Subject: utf8(email.subject),
              },
            },
            Destination: { ToAddresses: [email.to] },
            EmailTags: tags,
            FromEmailAddress: `${config.fromName} <${config.from}>`,
            ReplyToAddresses: [email.replyTo],
          }),
        );
        messageId = answer.MessageId;
      } catch (error) {
        const name = (error as { name?: string }).name ?? "Error";
        const code = codeOf(name);
        log.warn("email not sent", { code, kind: email.kind, reason: name, stream: email.stream });
        throw new EmailNotSent(code);
      }
      usage.record("email.sent");
      log.info("email sent", { kind: email.kind, messageId, stream: email.stream });
    },
  };
}

/** The mailer of a stage whose email is off (EM8): it sends nothing and asks no one. */
export const unavailableMailer: Mailer = {
  available: false,
  send: () => Promise.reject(new EmailNotSent("email_unavailable")),
};
