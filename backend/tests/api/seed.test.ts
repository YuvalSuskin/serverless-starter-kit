// The seed is what `pnpm dev`, the sweeps and the end-to-end tests stand on:
// a fresh dev server lists something. Checked through the store, as the list
// route reads it.
//
// Skeleton: the demo's seed, through the demo's store; bootstrap step 6 makes
// it the first resource's.
import { describe, expect, it } from "vitest";

import { SEED_MESSAGES, seedMessages } from "../../src/entries/dev/seed";
import { fakeMessageStore } from "../../src/fakes/message-store";
import { recordingUsage } from "../support/recording-usage";

describe("seed", () => {
  it("lists the three messages newest first, with their own ids", async () => {
    const { records, usage } = recordingUsage();
    const store = fakeMessageStore(usage);
    seedMessages(store);
    const listed = await store.list(10);
    expect(listed.map((m) => m.id)).toEqual(
      SEED_MESSAGES.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)).map((m) => m.id),
    );
    expect(new Set(listed.map((m) => m.id)).size).toBe(3);
    // The seed is not a request: it costs nothing to meter.
    expect(records).toEqual([]);
  });

  it("dates every message in the past, so a message sent now is newer", () => {
    for (const message of SEED_MESSAGES) {
      expect(Date.parse(message.createdAt)).toBeLessThan(Date.now());
    }
  });
});
