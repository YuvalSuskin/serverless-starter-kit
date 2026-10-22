import { describe, expect, it } from "vitest";

import { currentLogContext, extendLogContext, withLogContext } from "./log-context";

describe("log context", () => {
  it("is undefined outside a request", () => {
    expect(currentLogContext()).toBeUndefined();
  });

  it("follows the work across awaits", async () => {
    const seen = await withLogContext({ correlationId: "c1", principal: "anonymous" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return currentLogContext()?.correlationId;
    });
    expect(seen).toBe("c1");
  });

  it("keeps concurrent requests apart", async () => {
    const run = (id: string, delay: number) =>
      withLogContext({ correlationId: id, principal: "anonymous" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return currentLogContext()?.correlationId;
      });
    expect(await Promise.all([run("a", 5), run("b", 1)])).toEqual(["a", "b"]);
  });

  it("can be extended once the unit is known", () => {
    withLogContext({ correlationId: "c1", principal: "anonymous" }, () => {
      extendLogContext({ unitId: "demo" });
      expect(currentLogContext()).toMatchObject({ correlationId: "c1", unitId: "demo" });
    });
  });
});
