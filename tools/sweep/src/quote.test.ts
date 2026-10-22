import { expect, it } from "vitest";

import { containsQuote, normaliseQuote } from "./quote.ts";

it("treats a re-wrapped paragraph as the same quote", () => {
  const original = "Up to 20 MB per file, and at most\n500 files per visitor.";
  const rewrapped = "Up to 20 MB per file,  and at\nmost 500 files   per visitor.";
  expect(normaliseQuote(rewrapped)).toBe(normaliseQuote(original));
});

it("treats Hebrew with its points stored differently as the same quote", () => {
  // Shin, qamats, shin dot typed in two orders; and the presentation form of
  // shin-with-dot against the letter followed by the dot. Built from code
  // points so no formatter can fold them into one spelling.
  const text = (...points: number[]) => String.fromCodePoint(...points);
  const oneWay = text(0x5e9, 0x5b8, 0x5c1, 0x5dc);
  const otherWay = text(0x5e9, 0x5c1, 0x5b8, 0x5dc);
  expect(otherWay).not.toBe(oneWay);
  expect(normaliseQuote(otherWay)).toBe(normaliseQuote(oneWay));
  const presentationForm = text(0xfb2a, 0x5dc);
  const letterAndDot = text(0x5e9, 0x5c1, 0x5dc);
  expect(presentationForm).not.toBe(letterAndDot);
  expect(normaliseQuote(presentationForm)).toBe(normaliseQuote(letterAndDot));
});

it("finds a quote inside text that wraps it differently", () => {
  const file = "# Limits\n\nA visitor may upload up to 20 MB\nper file.\n";
  expect(containsQuote(file, "up to 20 MB per file")).toBe(true);
  expect(containsQuote(file, "up to 50 MB per file")).toBe(false);
});

it("never finds an empty quote", () => {
  expect(containsQuote("anything", "  ")).toBe(false);
});
