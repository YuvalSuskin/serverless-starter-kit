// Skeleton: the template's demo store, replaced by bootstrap step 6.
// The MessageStore port's contract: a message put is listed, newest first,
// up to a limit, and its DynamoDB write units are metered. Runs against the
// fake (unit) and against DynamoDB Local (contract).
import type { Message } from "@acme/contracts";

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { MessageStore } from "../../src/domain/ports";

export interface MessageStoreHarness {
  /** What the store metered, in order (it was built with recordingUsage's usage). */
  metered: () => readonly { meter: string; quantity: number }[];
  store: MessageStore;
}

// Each message is newer than every one before it, so the suite holds on the
// emulator's shared table: the newest messages put are the ones listed first.
let tick = Date.UTC(2030, 0, 1);
const aMessage = (overrides: Partial<Message> = {}): Message => {
  tick += 1000;
  return {
    body: "Hello from the contract suite",
    createdAt: new Date(tick).toISOString(),
    email: "visitor@example.test",
    id: randomUUID(),
    name: "Visitor",
    ...overrides,
  };
};

export function messageStoreContract(
  name: string,
  harness: () => MessageStoreHarness | Promise<MessageStoreHarness>,
) {
  describe(`MessageStore contract: ${name}`, () => {
    it("lists what was put, newest first, up to the limit", async () => {
      const { store } = await harness();
      const first = aMessage();
      const second = aMessage();
      const third = aMessage();
      for (const message of [first, second, third]) await store.put(message);
      expect(await store.list(2)).toEqual([third, second]);
    });

    it("lists newest first whatever the order they were put in", async () => {
      const { store } = await harness();
      const older = aMessage();
      const newer = aMessage();
      await store.put(newer);
      await store.put(older);
      expect((await store.list(2)).map((m) => m.id)).toEqual([newer.id, older.id]);
    });

    // The key is the time then the id, so two messages sent in the same
    // millisecond keep their own items and list by id, highest first, in the
    // byte order DynamoDB sorts keys by: the fake must agree with it.
    it("keeps two messages sent at the same moment apart, the higher id first", async () => {
      const { store } = await harness();
      const low = aMessage({ id: "a-low" });
      const high = aMessage({ createdAt: low.createdAt, id: "b-high" });
      await store.put(low);
      await store.put(high);
      expect((await store.list(2)).map((m) => m.id)).toEqual(["b-high", "a-low"]);
      // Upper case sorts before lower case by bytes, whatever the locale says.
      const upper = aMessage({ id: "C-upper" });
      const lower = aMessage({ createdAt: upper.createdAt, id: "c-lower" });
      await store.put(upper);
      await store.put(lower);
      expect((await store.list(2)).map((m) => m.id)).toEqual(["c-lower", "C-upper"]);
    });

    it("returns a message whole, accents, CJK and a long body included", async () => {
      const { store } = await harness();
      const message = aMessage({ body: "Très bien, 你好 ".repeat(300), name: "Zoë 李" });
      await store.put(message);
      expect((await store.list(1))[0]).toEqual(message);
    });

    it("lists no more than the limit", async () => {
      const { store } = await harness();
      await store.put(aMessage());
      expect(await store.list(1)).toHaveLength(1);
    });

    it("meters messages.write_units once per put", async () => {
      const { metered, store } = await harness();
      const before = metered().length;
      await store.put(aMessage());
      await store.put(aMessage());
      // A small message is one write unit (one started KB).
      expect(metered().slice(before)).toEqual([
        { meter: "messages.write_units", quantity: 1 },
        { meter: "messages.write_units", quantity: 1 },
      ]);
    });
  });
}
