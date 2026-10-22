// Skeleton: the template's demo use case, replaced by bootstrap step 6.
import type { Message, NewMessage } from "@acme/contracts";

import type { Clock } from "../../platform/clock";
import type { Ids } from "../../platform/ids";
import type { Logger } from "../../platform/logger";
import type { Mailer, MessageStore, OutgoingEmail } from "../ports";

import { escapeHtml } from "../lib/escape-html";

export interface SendMessageDeps {
  clock: Clock;
  ids: Ids;
  log: Logger;
  mailer: Mailer;
  messages: MessageStore;
  /** Where the owner is mailed; none, and the message is only stored. */
  ownerAddress: string | undefined;
}

// The owner's copy: plain on purpose, the template's one example of mail.
function notice(owner: string, message: Message): OutgoingEmail {
  const text = `${message.name} <${message.email}> wrote:\n\n${message.body}\n`;
  return {
    html: `<p><strong>${escapeHtml(message.name)}</strong> (${escapeHtml(message.email)}) wrote:</p><p style="white-space:pre-wrap">${escapeHtml(message.body)}</p>`,
    kind: "contact_message",
    replyTo: message.email,
    stream: "team",
    subject: `New message from ${message.name}`,
    text,
    to: owner,
  };
}

// The owner's notice is best effort: the store is the record, so a mail that
// cannot be sent is logged (its code only, never the visitor's address or
// words) and the message is kept.
async function notifyOwner(deps: SendMessageDeps, message: Message): Promise<void> {
  if (deps.ownerAddress === undefined) {
    deps.log.warn("message email skipped: no owner address is configured");
    return;
  }
  try {
    await deps.mailer.send(notice(deps.ownerAddress, message));
  } catch (error) {
    deps.log.warn("message email not sent", {
      code: (error as { code?: string }).code ?? "unknown",
    });
  }
}

/** Stores a visitor's message, then mails it to the owner. */
export async function sendMessage(deps: SendMessageDeps, input: NewMessage): Promise<Message> {
  const message: Message = {
    ...input,
    createdAt: deps.clock.now().toISOString(),
    id: deps.ids.next(),
  };
  await deps.messages.put(message);
  await notifyOwner(deps, message);
  return message;
}
