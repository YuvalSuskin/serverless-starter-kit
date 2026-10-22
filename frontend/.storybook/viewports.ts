// Storybook's viewport options. `mobile` is the Pixel 7 from e2e/phones.ts;
// the storybook-mobile Vitest project renders every story at it.
// tests/story-viewport.test.ts fails if the two drift apart.
export const STORY_VIEWPORTS = {
  mobile: { name: "Pixel 7", styles: { width: "412px", height: "839px" }, type: "mobile" },
} as const;
