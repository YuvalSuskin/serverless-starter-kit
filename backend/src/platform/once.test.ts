import { describe, expect, it, vi } from "vitest";

import { once } from "./once";

// The API's rare SDK clients load on first use, once.
describe("once", () => {
  it("loads nothing until asked, then once however often it is asked", async () => {
    const load = vi.fn(() => Promise.resolve({ client: true }));
    const get = once(load);
    expect(load).not.toHaveBeenCalled();
    const [a, b] = await Promise.all([get(), get()]);
    expect(await get()).toBe(a);
    expect(b).toBe(a);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("tries a failed load again on the next call", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("first"))
      .mockResolvedValue("loaded");
    const get = once(load);
    await expect(get()).rejects.toThrow("first");
    await expect(get()).resolves.toBe("loaded");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
