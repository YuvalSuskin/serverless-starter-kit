import { describe, expect, it } from "vitest";

import { redact, REDACTED_WORDS } from "./redact";

describe("redact", () => {
  // Pins the list: removing a word from REDACTED_WORDS must be a deliberate change here too.
  it("covers the personal data the spec names", () => {
    expect([...REDACTED_WORDS].sort((a, b) => a.localeCompare(b))).toEqual([
      "address",
      "email",
      "gps",
      "lat",
      "latitude",
      "lng",
      "location",
      "longitude",
      "name",
      "phone",
    ]);
  });

  it("replaces those values at any depth and in any case, and keeps ids", () => {
    expect(
      redact({
        unitId: "u1",
        visitor: { Name: "Dana", places: [{ gps: [32.1, 34.8], id: "p1" }] },
      }),
    ).toEqual({
      unitId: "u1",
      visitor: { Name: "[redacted]", places: [{ gps: "[redacted]", id: "p1" }] },
    });
  });

  // A backstop that matches only exact key names misses the obvious variants.
  it.each([
    "email",
    "phoneNumber",
    "visitorEmail",
    "firstName",
    "display_name",
    "homeAddress",
    "lat",
    "lng",
    "location",
    "gpsLatitude",
  ])("redacts %s", (key) => {
    expect(redact({ [key]: "secret" })).toEqual({ [key]: "[redacted]" });
  });

  it.each(["code", "route", "unitId", "hostname", "surface", "allocation", "flat", "status"])(
    "keeps %s",
    (key) => {
      expect(redact({ [key]: "value" })).toEqual({ [key]: "value" });
    },
  );

  // Error's fields are not enumerable: spreading one logs {}, and the
  // failure disappears from the logs.
  it("keeps an Error's name, message and stack", () => {
    const error = new TypeError("boom");
    expect(redact({ error })).toEqual({
      error: { message: "boom", name: "TypeError", stack: error.stack },
    });
  });

  it("keeps a Date as its ISO string", () => {
    expect(redact({ at: new Date("2026-01-01T00:00:00.000Z") })).toEqual({
      at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("leaves primitives alone", () => {
    expect(redact("text")).toBe("text");
    expect(redact(null)).toBeNull();
  });
});
