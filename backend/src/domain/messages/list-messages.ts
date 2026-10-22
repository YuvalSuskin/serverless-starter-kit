// Skeleton: the template's demo use case, replaced by bootstrap step 6.
import type { Message, Page } from "@acme/contracts";

import type { MessageStore } from "../ports";

const DEFAULT_LIMIT = 50;

/** The newest messages first: one page, since the skeleton keeps no cursor. */
export async function listMessages(
  deps: { messages: MessageStore },
  query: { limit?: number },
): Promise<Page<Message>> {
  return { items: await deps.messages.list(query.limit ?? DEFAULT_LIMIT), nextCursor: null };
}
