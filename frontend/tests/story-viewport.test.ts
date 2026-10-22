// Pins Storybook's phone viewport to the Pixel 7 preset the other phone
// projects emulate. Storybook's Vitest plugin sizes
// each story from Storybook's viewport options, not from Vitest's instance, and
// the preview cannot import playwright, so the numbers are written out twice.
import { devices } from "playwright";
import { expect, it } from "vitest";

import { STORY_VIEWPORTS } from "../.storybook/viewports";
import { PHONES } from "../e2e/phones";

it("the stories' mobile viewport is the phone preset's size", () => {
  const { width, height } = devices[PHONES.android].viewport;
  expect(STORY_VIEWPORTS.mobile.styles).toEqual({
    width: `${String(width)}px`,
    height: `${String(height)}px`,
  });
});
