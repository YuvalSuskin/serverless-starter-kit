// Pins how the e2e tests find the app: a running preview
// via E2E_BASE_URL, or their own production server on E2E_PORT, never a server
// another worktree happens to have on the same port.
import { afterEach, expect, it, vi } from "vitest";

import { phoneProjects } from "../e2e/phones";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function config() {
  return (await import("../playwright.config")).default;
}

it("tests a running preview when E2E_BASE_URL is set, starting no server", async () => {
  vi.stubEnv("E2E_BASE_URL", "http://a.localhost:4300");
  const { use, webServer } = await config();
  expect(use?.baseURL).toBe("http://a.localhost:4300");
  expect(webServer).toBeUndefined();
});

it("otherwise starts its own servers on E2E_PORT and E2E_API_PORT, and never reuses one", async () => {
  vi.stubEnv("E2E_BASE_URL", undefined);
  vi.stubEnv("E2E_PORT", "3200");
  vi.stubEnv("E2E_API_PORT", "4302");
  const { use, webServer } = await config();
  expect(use?.baseURL).toBe("http://localhost:3200");
  // The seeded dev API the pages need, then the app, pointed at it.
  expect(webServer).toMatchObject([
    {
      command: "pnpm --dir ../backend run serve",
      env: { DEV_API_PORT: "4302", DEV_SITE_URL: "http://localhost:3200" },
      reuseExistingServer: false,
      url: "http://127.0.0.1:4302/api/health",
    },
    {
      command: "pnpm start --port 3200",
      env: { API_ORIGIN: "http://127.0.0.1:4302", API_PROXY_ORIGIN: "http://127.0.0.1:4302" },
      reuseExistingServer: false,
      url: "http://localhost:3200",
    },
  ]);
});

it("defaults to port 3100", async () => {
  vi.stubEnv("E2E_BASE_URL", undefined);
  vi.stubEnv("E2E_PORT", undefined);
  expect((await config()).use?.baseURL).toBe("http://localhost:3100");
});

// Every spec runs against the one build; there is no hidden page to choose.
it("runs every spec, on every project", async () => {
  vi.stubEnv("E2E_BASE_URL", undefined);
  const { projects, testIgnore, testMatch } = await config();
  expect(testMatch).toBeUndefined();
  expect(testIgnore).toBeUndefined();
  // Desktop first, then the phones in e2e/phones.ts's order (the iphone is left
  // out only on macOS 14, which tests/phones.test.ts pins).
  expect(projects?.map((project) => project.name)).toEqual([
    "chromium",
    ...phoneProjects().map((project) => project.name),
  ]);
});
