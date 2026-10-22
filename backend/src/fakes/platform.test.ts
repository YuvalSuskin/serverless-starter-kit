import { describe, expect, it } from "vitest";

import { withLogContext } from "../platform/log-context";
import { fakePlatform } from "./platform";

describe("fakePlatform", () => {
  // The dev server runs on real time. Swapping platform.clock afterwards left
  // usage records stamped with the fake clock's frozen start.
  it("meters with the clock it is given", () => {
    const now = new Date("2030-06-01T12:00:00.000Z");
    const { log, platform } = fakePlatform({ clock: { now: () => now } });
    withLogContext({ correlationId: "c1", principal: "system", unitId: "demo" }, () => {
      platform.usage.record("email.sent");
    });
    expect(log.lines).toEqual([
      expect.objectContaining({
        fields: expect.objectContaining({ at: now.toISOString() }) as unknown,
      }),
    ]);
  });

  it("uses the ids it is given", () => {
    const { platform } = fakePlatform({ ids: { next: () => "id-1" } });
    expect(platform.ids.next()).toBe("id-1");
  });
});
