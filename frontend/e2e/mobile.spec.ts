// Skeleton: the template's phone checks, whose page list bootstrap step 6 replaces.
import { longPress, swipe, tap } from "@/lib/gestures";

import { expect, type Page, test } from "./test";

// Runs on every project: desktop, iPhone (WebKit) and Android (Chromium).
// Skeleton: the paths are the template's pages.

// The skeleton's pages; a project lists one of each pillar here.
const PILLARS = ["/", "/contact", "/messages"];

for (const path of PILLARS) {
  test(`${path} does not scroll sideways`, async ({ page }) => {
    await page.goto(path);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });
}

// Without `width=device-width` a phone lays the page out 980px wide, and the
// test above still passes: the page and the window grow together.
test("a phone lays every pillar out at the device's width", async ({
  page,
  isMobile,
  viewport,
}) => {
  // Skipped on desktop, which has no device width; runs on both phones.
  test.skip(!isMobile, "only a phone has a device width to match");
  for (const path of PILLARS) {
    await page.goto(path);
    expect(await page.evaluate(() => window.innerWidth), path).toBe(viewport?.width);
  }
});

// The touch helpers from @/lib/gestures, run in this project's engine. This is
// the only place they run on WebKit, and the check that each one is
// self-contained: Playwright sends its source into the page.
test.describe("touch helpers in this engine", () => {
  const PLAYGROUND = `<!doctype html>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <button id="target" style="width:200px;height:120px">target</button>
    <div id="pages" dir="rtl" style="width:300px;display:flex;overflow-x:auto;scroll-snap-type:x mandatory">
      ${'<div style="flex:0 0 300px;height:100px;scroll-snap-align:start"></div>'.repeat(3)}
    </div>`;

  // Records the pointer, touch and click events #target receives, as
  // "type:pointerType", with the time of each.
  async function recordEvents(page: Page) {
    await page.setContent(PLAYGROUND);
    await page.locator("#target").evaluate((target) => {
      const log: { event: string; time: number }[] = [];
      Object.assign(window, { gestureLog: log });
      const types = [
        "pointerdown",
        "pointermove",
        "pointerup",
        "touchstart",
        "touchmove",
        "touchend",
        "click",
      ];
      for (const type of types) {
        target.addEventListener(type, (event) => {
          const pointerType = event instanceof PointerEvent ? event.pointerType : "";
          log.push({ event: `${type}:${pointerType}`, time: event.timeStamp });
        });
      }
    });
    return () =>
      page.evaluate(
        () =>
          (window as typeof window & { gestureLog: { event: string; time: number }[] }).gestureLog,
      );
  }

  test("a trusted tap arrives as a touch pointer and a click", async ({ page, hasTouch }) => {
    // Skipped on desktop, which has no touchscreen; runs on both phones.
    test.skip(!hasTouch, "desktop has no touchscreen");
    const events = await recordEvents(page);
    await page.locator("#target").tap();
    const log = (await events()).map(({ event }) => event);
    expect(log).toContain("pointerdown:touch");
    expect(log.some((event) => event.startsWith("click"))).toBe(true);
  });

  test("tap runs in the page and clicks with a touch pointer", async ({ page, hasTouch }) => {
    const events = await recordEvents(page);
    await page.locator("#target").evaluate(tap);
    const log = (await events()).map(({ event }) => event);
    expect(log[0]).toBe("pointerdown:touch");
    expect(log.some((event) => event.startsWith("click"))).toBe(true);
    if (hasTouch) expect(log).toContain("touchend:");
  });

  test("swipe runs in the page and drags a touch pointer", async ({ page, hasTouch }) => {
    const events = await recordEvents(page);
    await page.locator("#target").evaluate(swipe, { direction: "left", distance: 80 } as const);
    const log = (await events()).map(({ event }) => event);
    expect(log[0]).toBe("pointerdown:touch");
    expect(log).toContain("pointermove:touch");
    expect(log).toContain("pointerup:touch");
    if (hasTouch) expect(log).toContain("touchmove:");
  });

  test("longPress runs in the page and holds a touch pointer", async ({ page }) => {
    const events = await recordEvents(page);
    await page.locator("#target").evaluate(longPress, { duration: 300 });
    const log = await events();
    const at = (event: string) => log.find((entry) => entry.event === event)?.time ?? 0;
    expect(at("pointerup:touch") - at("pointerdown:touch")).toBeGreaterThanOrEqual(300);
    expect(log.some(({ event }) => event.startsWith("click"))).toBe(false);
  });

  // Scroll-snap is tested by scrolling: synthetic touches scroll nothing.
  test("an RTL scroll-snap list settles on the next page after a scroll", async ({ page }) => {
    await page.setContent(PLAYGROUND);
    const scrollLeft = await page.locator("#pages").evaluate(async (pages) => {
      const settled = new Promise((resolve) => {
        pages.addEventListener("scrollend", resolve, { once: true });
        // An engine without scrollend waits 2s here instead of timing out.
        setTimeout(resolve, 2000);
      });
      pages.scrollBy({ left: -200 });
      await settled;
      return pages.scrollLeft;
    });
    expect(scrollLeft).toBe(-300);
  });
});
