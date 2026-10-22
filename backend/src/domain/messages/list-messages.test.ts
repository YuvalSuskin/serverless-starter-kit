// Skeleton: the template's demo use case, replaced by bootstrap step 6.
import { describe, expect, it } from "vitest";

import { recordingUsage } from "../../../tests/support/recording-usage";
import { fakeMessageStore } from "../../fakes/message-store";
import { listMessages } from "./list-messages";

const at = (minute: number) => `2026-03-04T10:0${minute.toString()}:00.000Z`;
const aMessage = (id: string, minute: number) => ({
  body: `Message ${id}`,
  createdAt: at(minute),
  email: "maya@example.test",
  id,
  name: "Maya",
});

describe("listMessages", () => {
  it("answers newest first, as a page with no next page", async () => {
    const messages = fakeMessageStore(recordingUsage().usage);
    await messages.put(aMessage("a", 1));
    await messages.put(aMessage("c", 3));
    await messages.put(aMessage("b", 2));
    const page = await listMessages({ messages }, { limit: 10 });
    expect(page.items.map((m) => m.id)).toEqual(["c", "b", "a"]);
    expect(page.nextCursor).toBeNull();
  });

  it("answers no more than the limit, and fifty when none is asked", async () => {
    const messages = fakeMessageStore(recordingUsage().usage);
    for (let n = 0; n < 60; n += 1) {
      await messages.put({
        ...aMessage(`m${n.toString()}`, 0),
        createdAt: `2026-03-04T10:${n.toString().padStart(2, "0")}:00.000Z`,
      });
    }
    expect((await listMessages({ messages }, { limit: 2 })).items).toHaveLength(2);
    expect((await listMessages({ messages }, {})).items).toHaveLength(50);
  });

  it("answers an empty page when nobody has written", async () => {
    const messages = fakeMessageStore(recordingUsage().usage);
    expect(await listMessages({ messages }, {})).toEqual({ items: [], nextCursor: null });
  });
});
