import { expectFitsLaptop } from "./laptop";
// Skeleton: the template's laptop-fit page list, replaced by bootstrap step 6.
import { expect, test } from "./test";

// Every app page joins this list when it is built. The check sets the
// laptop's viewport itself, so it holds on every project. A page that loads
// its data in the browser names the text that shows once it has arrived, so
// the check measures the page, not its loading state.
const APP_PAGES: readonly { path: string; ready?: string }[] = [
  // The seed's messages, listed once the API has answered.
  { path: "/messages", ready: "Noa Barak" },
];

for (const { path, ready } of APP_PAGES) {
  test(`${path} fits the laptop screen without scrolling`, async ({ page }) => {
    await page.goto(path);
    // The words may be written twice, one for a phone and one for a computer:
    // wait for the one this width shows.
    if (ready !== undefined) {
      await expect(page.getByText(ready).filter({ visible: true }).first()).toBeVisible();
    }
    await expectFitsLaptop(page);
  });
}
