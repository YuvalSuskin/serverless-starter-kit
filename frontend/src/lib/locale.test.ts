import { describe, expect, it } from "vitest";

import { DIRECTION, LOCALE } from "./locale";

describe("locale", () => {
  it("is English: Intl picks English plural forms", () => {
    expect(new Intl.PluralRules(LOCALE).select(1)).toBe("one");
    expect(new Intl.PluralRules(LOCALE).select(2)).toBe("other");
  });

  it("is English: Intl names the months in English", () => {
    const january = new Date(Date.UTC(2026, 0, 15));
    expect(
      new Intl.DateTimeFormat(LOCALE, { month: "long", timeZone: "UTC" }).format(january),
    ).toBe("January");
  });

  it("is written left to right", () => {
    expect(DIRECTION).toBe("ltr");
  });
});
