// Skeleton: the template's demo fake, replaced by bootstrap step 6.
import type { Message } from "@acme/contracts";

import type { MessageStore } from "../domain/ports";
import type { Usage } from "../platform/usage";

import { DEMO_UNIT } from "../domain/messages";
import { writeUnits } from "../platform/request-units";

export interface FakeMessageStore extends MessageStore {
  /** The dev seed's messages, stored as they are, outside any request (so unmetered). */
  seed(message: Message): void;
}

// The sort key the adapter stores, so this fake keys its items the same way:
// a message is the item `createdAt#id`, and newest first is its reverse.
const order = (message: Message) => `${message.createdAt}#${message.id}`;

// Plain string comparison, not localeCompare: DynamoDB sorts keys by their
// UTF-8 bytes, and a locale's collation would order ties differently. `<`
// compares UTF-16 code units, which is the same order for ASCII keys (ids are
// UUIDs); a store with non-ASCII keys would compare bytes.
const byOrderDescending = (a: string, b: string) => {
  if (a === b) return 0;
  return a < b ? 1 : -1;
};

// In memory, behaving like the DynamoDB adapter: the shared suite in
// tests/contracts/message-store.contract.ts runs against both. It meters as
// the adapter writes: the item's size in write units, per put.
export function fakeMessageStore(usage: Usage): FakeMessageStore {
  const messages = new Map<string, Message>();
  return {
    list: (limit) =>
      Promise.resolve(
        [...messages.entries()]
          .toSorted(([a], [b]) => byOrderDescending(a, b))
          .slice(0, limit)
          .map(([, message]) => ({ ...message })),
      ),
    put: (message) => {
      messages.set(order(message), { ...message });
      // The adapter's item, roughly, for metering.
      const item = {
        ...message,
        pk: `UNIT#${DEMO_UNIT}`,
        schemaVersion: 1,
        sk: `MESSAGE#${order(message)}`,
      };
      usage.record("messages.write_units", writeUnits([item]));
      return Promise.resolve();
    },
    seed: (message) => {
      messages.set(order(message), { ...message });
    },
  };
}
