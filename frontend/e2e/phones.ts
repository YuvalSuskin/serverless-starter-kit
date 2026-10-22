import { devices } from "@playwright/test";
import os from "node:os";

// The phones every test profile emulates: names of
// Playwright `devices` presets, each carrying its viewport, touch, user agent
// and engine. playwright.config.ts and vitest.config.ts both read this.
export const PHONES = { iphone: "iPhone 15", android: "Pixel 7" } as const;

// One e2e project per phone. On macOS below 15 (Darwin below 24), Playwright
// installs a frozen WebKit that no longer speaks its protocol ("Unknown
// setting: PushAPIEnabled"), so the iPhone project runs only in CI there.
// A function, so importing PHONES prints nothing; the host is a
// parameter so tests/phones.test.ts can pin the guard.
export function phoneProjects(host = { platform: process.platform, release: os.release() }) {
  const oldMac = host.platform === "darwin" && Number(host.release.split(".")[0]) < 24;
  // Playwright loads this config in every worker; say it once, from the runner.
  if (oldMac && process.env.TEST_WORKER_INDEX === undefined) {
    console.log(
      "e2e: skipping the iphone project; Playwright's WebKit needs macOS 15+. CI runs it.",
    );
  }
  return Object.entries(PHONES)
    .filter(([name]) => !(oldMac && name === "iphone"))
    .map(([name, device]) => ({ name, use: { ...devices[device] } }));
}
