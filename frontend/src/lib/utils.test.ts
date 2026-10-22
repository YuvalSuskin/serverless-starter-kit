import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("keeps a brand colour and a brand size together", () => {
    expect(cn("text-grey-900", "text-100")).toBe("text-grey-900 text-100");
  });

  it("lets a later brand size override an earlier one", () => {
    expect(cn("text-100", "text-300")).toBe("text-300");
  });

  it("knows the sub-16px steps", () => {
    expect(cn("text-grey-900", "text-075")).toBe("text-grey-900 text-075");
    expect(cn("text-075", "text-050")).toBe("text-050");
  });

  it("lets a later brand radius override an earlier one", () => {
    expect(cn("rounded-card", "rounded-pill")).toBe("rounded-pill");
  });

  it("drops falsy inputs", () => {
    expect(cn("p-2", false, undefined, null, "m-1")).toBe("p-2 m-1");
  });
});
