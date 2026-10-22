import { expect, type Page } from "@playwright/test";

// The owner's laptop with the browser in full screen: a 14-inch MacBook Pro
// at its default scaling (1512 x 982), less the browser's toolbar. On a
// computer, an app or sign-in page fits this without scrolling; only a long
// list or table scrolls, inside its own region (design/DESIGN.md, "A computer
// screen holds the page").
const LAPTOP = { width: 1512, height: 860 } as const;

export async function expectFitsLaptop(page: Page): Promise<void> {
  await page.setViewportSize(LAPTOP);
  const { scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(
    scrollHeight,
    "the page scrolls at laptop size; only a list or table may scroll, inside its own region",
  ).toBeLessThanOrEqual(innerHeight);
}
