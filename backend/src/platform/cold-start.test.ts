import { describe, expect, it } from "vitest";

import { prime } from "./cold-start";

// The cold start does the first request's one-off work, and
// never fails or stalls the start doing it.
describe("prime", () => {
  it("runs every step together and waits for them", async () => {
    const done: string[] = [];
    const step = (name: string, ms: number) => async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      done.push(name);
    };
    const started = performance.now();
    await prime([step("slow", 60), step("fast", 10)]);
    expect(done).toEqual(["fast", "slow"]);
    // Together, not one after the other.
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("a failing step fails nothing", async () => {
    await expect(
      prime([() => Promise.reject(new Error("no network")), () => Promise.resolve()]),
    ).resolves.toBeUndefined();
  });

  it("stops waiting at its limit, and tells each step to stop", async () => {
    let aborted = false;
    const started = performance.now();
    await prime(
      [
        (signal) =>
          new Promise<void>(() => {
            signal.addEventListener("abort", () => {
              aborted = true;
            });
          }),
      ],
      30,
    );
    expect(aborted).toBe(true);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
