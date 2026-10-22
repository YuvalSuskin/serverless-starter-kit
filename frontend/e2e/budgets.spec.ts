import { PAGES, TIERS } from "./budgets";
import { expect, type Page, test } from "./test";

// Each budgeted page (e2e/budgets.ts) against its tier. Chromium only: the
// bytes are counted through the Chrome DevTools Protocol, and layout shifts
// and the largest paint through observers WebKit does not have. They run on
// the desktop and Android projects, whose layouts differ.

// Loads the page and lets it settle, then reports what it fetched, in
// compressed bytes. Which requests belong to the load is decided by the
// browser's own timestamps (started before the load event), not by when the
// events reach this test, so the counts do not depend on timing here.
async function loadOf(page: Page, path: string) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Page.enable");
  let loadAt = Number.POSITIVE_INFINITY;
  const started = new Map<string, { at: number; url: string }>();
  const kinds = new Map<string, string>();
  const fetched: { at: number; bytes: number; kind: string; url: string }[] = [];
  cdp.on("Page.loadEventFired", (event) => {
    loadAt = event.timestamp;
  });
  cdp.on("Network.requestWillBeSent", (event) => {
    if (!started.has(event.requestId)) {
      started.set(event.requestId, { at: event.timestamp, url: event.request.url });
    }
  });
  cdp.on("Network.responseReceived", (event) => {
    kinds.set(event.requestId, event.type);
  });
  // A failed request (a 404's round trip, an aborted one) still costs a
  // request on a weak signal.
  const settled = (requestId: string, bytes: number) => {
    const request = started.get(requestId);
    if (!request) return;
    fetched.push({ ...request, bytes, kind: kinds.get(requestId) ?? "Other" });
  };
  cdp.on("Network.loadingFinished", (event) => {
    settled(event.requestId, event.encodedDataLength);
  });
  cdp.on("Network.loadingFailed", (event) => {
    settled(event.requestId, 0);
  });
  await page.addInitScript(() => {
    const w = window as unknown as { layoutShift: number; lcpLazy: boolean };
    w.layoutShift = 0;
    w.lcpLazy = false;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        hadRecentInput: boolean;
        value: number;
      })[]) {
        if (!entry.hadRecentInput) w.layoutShift += entry.value;
      }
    }).observe({ buffered: true, type: "layout-shift" });
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      const element = last !== undefined && "element" in last ? last.element : null;
      w.lcpLazy = element instanceof HTMLImageElement && element.loading === "lazy";
    }).observe({ buffered: true, type: "largest-contentful-paint" });
  });
  const response = await page.goto(path, { waitUntil: "load" });
  // Settle: hydration's scripts and late layout shifts count too. There is
  // no event for "nothing more will shift", so the window is fixed.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 2000)));

  const beforeLoad = fetched.filter((request) => request.at <= loadAt);
  const kb = (requests: typeof fetched, kind: string) =>
    Math.round(
      requests.filter((request) => request.kind === kind).reduce((sum, r) => sum + r.bytes, 0) /
        1024,
    );
  // Next lists some preloads both in the HTML and in the Link header.
  const fontPreloadsInHeader = (response?.headers().link ?? "")
    .split(",")
    .filter((link) => /as=["']?font/.test(link))
    .flatMap((link) => {
      const open = link.indexOf("<");
      const close = link.indexOf(">", open);
      return open === -1 || close === -1
        ? []
        : [new URL(link.slice(open + 1, close), page.url()).pathname];
    });
  return {
    fontKb: kb(beforeLoad, "Font"),
    fontPreloadsInHeader,
    imageKb: kb(beforeLoad, "Image"),
    requests: beforeLoad.length,
    // Every script up to the settled page, including chunks hydration loads
    // after the load event.
    scriptKb: kb(fetched, "Script"),
    styleKb: kb(beforeLoad, "Stylesheet"),
  };
}

for (const { path, tier } of PAGES) {
  // eslint-disable-next-line sonarjs/assertions-in-tests -- expect.soft from ./test is not recognised as an assertion
  test(`${path} stays within the ${tier} budget`, async ({ browserName, page }) => {
    // Skipped in WebKit (the iPhone project): see above.
    test.skip(browserName !== "chromium", "measured through the Chrome DevTools Protocol");
    const budget = TIERS[tier];
    const load = await loadOf(page, path);
    const inPage = await page.evaluate(() => {
      const w = window as unknown as { layoutShift: number; lcpLazy: boolean };
      return {
        // A script without async, defer or type=module stops the page
        // painting until it has loaded and run.
        blockingScripts: [...document.querySelectorAll<HTMLScriptElement>("script[src]")].filter(
          (script) =>
            !script.async && !script.defer && script.type !== "module" && !script.noModule,
        ).length,
        fontPreloads: [
          ...document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="font"]'),
        ].map((link) => new URL(link.href).pathname),
        layoutShift: w.layoutShift,
        lcpLazy: w.lcpLazy,
      };
    });

    // BUDGETS_PRINT=1 prints what the page loaded, the numbers a tier is set
    // from (frontend/CLAUDE.md, Performance budgets); without it, nothing.
    if (process.env.BUDGETS_PRINT) {
      console.log(`budgets: ${path} (${tier}) ${JSON.stringify({ ...load, ...inPage })}`);
    }

    expect.soft(load.scriptKb, "JavaScript, KB").toBeLessThanOrEqual(budget.scriptKb);
    expect.soft(load.styleKb, "CSS, KB").toBeLessThanOrEqual(budget.styleKb);
    expect.soft(load.fontKb, "fonts, KB").toBeLessThanOrEqual(budget.fontKb);
    expect
      .soft(new Set([...inPage.fontPreloads, ...load.fontPreloadsInHeader]).size, "preloaded fonts")
      .toBeLessThanOrEqual(budget.fontPreloads);
    expect.soft(load.imageKb, "images, KB").toBeLessThanOrEqual(budget.imageKb);
    expect.soft(load.requests, "requests").toBeLessThanOrEqual(budget.requests);
    // No layout shift worth the name: CLS at most 0.01.
    expect.soft(inPage.layoutShift, "layout shift").toBeLessThanOrEqual(0.01);
    expect.soft(inPage.blockingScripts, "render-blocking scripts").toBe(0);
    // The largest paint is never waited for behind lazy loading.
    expect.soft(inPage.lcpLazy, "largest paint is a lazy image").toBe(false);
  });
}
