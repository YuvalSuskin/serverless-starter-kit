// Skeleton: the template's smoke test, replaced by bootstrap step 6.
import AxeBuilder from "@axe-core/playwright";

import { DIRECTION, LOCALE } from "@/lib/locale";

import { smallTapTargets, TAP_TARGET_MIN } from "../tests/tap-targets";
import { expect, test } from "./test";

// The demo journey on the desktop and both phones: a visitor writes to the
// owner on the public page, and the app page lists the message. The API is the
// backend's in-memory dev server with its seed (three messages).

test("the home page links to the contact page and the messages page", async ({
  page,
  isMobile,
}) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  // From the one module the root layout reads (D6), so a project's own
  // locale (bootstrap step 5) needs no change here.
  await expect(page.locator("html")).toHaveAttribute("lang", LOCALE);
  await expect(page.locator("html")).toHaveAttribute("dir", DIRECTION);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const link = page.getByRole("navigation", { name: "Pages" }).getByRole("link", {
    name: "Write a message",
  });
  await (isMobile ? link.tap() : link.click());
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole("heading", { level: 1, name: "Contact" })).toBeVisible();
});

test("an address that matches nothing is a 404 with a way home", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page does not exist.");
  await expect(page.getByRole("link", { name: "Back to the home page" })).toHaveAttribute(
    "href",
    "/",
  );
});

test("the site is open to search engines except its app pages, and says nothing about Next", async ({
  request,
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Disallow: /messages");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("/contact");
  expect(sitemap.headers()["x-powered-by"]).toBeUndefined();
});

test("the app page stays out of search indexes", async ({ page }) => {
  await page.goto("/messages");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
});

// An axe violation fails the page, as it fails a story.
for (const path of ["/", "/contact", "/messages", "/no-such-page"]) {
  test(`${path} has no accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((one) => `${one.id}: ${one.help}`)).toEqual([]);
  });
}

test("the messages page lists the seeded messages, newest first", async ({ page }) => {
  await page.goto("/messages");
  await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
  // The three projects share one store, so messages they sent may be listed too:
  // the seeded three are all there, in order, and the seed's oldest is last.
  const items = page.getByRole("listitem");
  await expect(items.filter({ hasText: "Noa Barak" })).toHaveCount(1);
  const names = await items.allTextContents();
  const order = ["Noa Barak", "Daniel Levi", "Maya Cohen"].map((name) =>
    names.findIndex((text) => text.includes(name)),
  );
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(order[0]).toBeGreaterThanOrEqual(0);
  await expect(items.last()).toContainText("Maya Cohen");
});

test("a visitor sends a message and sees it on the messages page", async ({
  page,
  isMobile,
}, testInfo) => {
  // Each project sends its own words, so the three never meet in the one store.
  const body = `Hello from the ${testInfo.project.name} test.`;

  await page.goto("/contact");
  await page.getByLabel("Name").fill("Ravit Test");
  await page.getByLabel("Email").fill("ravit@example.test");

  // An empty message is refused with the contract's own words, and nothing typed is lost.
  const send = page.getByRole("button", { name: "Send message" });
  await (isMobile ? send.tap() : send.click());
  await expect(page.getByText("Message is required.")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Ravit Test");

  await page.getByLabel("Message").fill(body);
  await (isMobile ? send.tap() : send.click());
  await expect(page.getByRole("status")).toHaveText("Thank you. Your message is sent.");

  await page.goto("/messages");
  const mine = page.getByRole("listitem").filter({ hasText: body });
  await expect(mine).toHaveCount(1);
  await expect(mine).toContainText("Ravit Test");
  await expect(mine).toContainText("ravit@example.test");
  // Newest first: it is listed above the seeded messages.
  const texts = await page.getByRole("listitem").allTextContents();
  expect(texts.findIndex((text) => text.includes(body))).toBeLessThan(
    texts.findIndex((text) => text.includes("Noa Barak")),
  );
});

test.describe("on a phone", () => {
  test.beforeEach(({ isMobile }) => {
    // Skipped on desktop, whose mouse needs no more; runs on both phones.
    test.skip(!isMobile, "tap targets are a phone's measure");
  });

  test("the home, contact and messages pages are usable by touch", async ({ page }) => {
    for (const path of ["/", "/contact", "/messages"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const small = await page.evaluate(smallTapTargets, {
        exempt: [],
        min: TAP_TARGET_MIN,
      });
      expect(
        small.map((one) => `${one.name} ${String(one.width)}x${String(one.height)}`),
        `under ${String(TAP_TARGET_MIN)}px on ${path}`,
      ).toEqual([]);
      // The page does not scroll sideways.
      const wider = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(wider, `${path} scrolls sideways`).toBe(false);
    }
  });
});
