// Pins the dev proxy's target: Next sends /api/* and the
// dev media under /media/* to the dev API on DEV_API_PORT, so
// each `pnpm preview` worktree talks to its own API.
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function devRewrites() {
  vi.stubEnv("NODE_ENV", "development");
  const { default: config } = await import("../next.config");
  return config.rewrites?.();
}

it("proxies /api/* and /media/* to the dev API on 8787 by default", async () => {
  vi.stubEnv("DEV_API_PORT", undefined);
  expect(await devRewrites()).toEqual([
    { destination: "http://127.0.0.1:8787/api/:path*", source: "/api/:path*" },
    { destination: "http://127.0.0.1:8787/media/:path*", source: "/media/:path*" },
  ]);
});

it("follows DEV_API_PORT", async () => {
  vi.stubEnv("DEV_API_PORT", "4301");
  expect(await devRewrites()).toEqual([
    { destination: "http://127.0.0.1:4301/api/:path*", source: "/api/:path*" },
    { destination: "http://127.0.0.1:4301/media/:path*", source: "/media/:path*" },
  ]);
});

it("refuses a DEV_API_PORT that is not a port", async () => {
  vi.stubEnv("DEV_API_PORT", "80a");
  await expect(devRewrites()).rejects.toThrow(/DEV_API_PORT/);
});
