import { defineConfig, devices } from "@playwright/test";

import { phoneProjects } from "./e2e/phones";

const isCI = Boolean(process.env.CI);
// A running `pnpm preview`: test it as it is.
const previewUrl = process.env.E2E_BASE_URL;
const PORT = Number(process.env.E2E_PORT ?? 3100);
const ownUrl = `http://localhost:${String(PORT)}`;
// The seeded in-memory API the pages need, on its own port so it
// never meets `pnpm dev`'s (8787) or another worktree's.
const API_PORT = Number(process.env.E2E_API_PORT ?? 8788);
const API_ORIGIN = `http://127.0.0.1:${String(API_PORT)}`;

// The specs run against a production build, so `pnpm build` must run first
// (`pnpm e2e` does it). A server already on the port fails loudly rather than
// being reused: it may be another worktree's.
export default defineConfig({
  testDir: "./e2e",
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["list"]] : "list",
  use: { baseURL: previewUrl ?? ownUrl, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }, ...phoneProjects()],
  ...(previewUrl
    ? {}
    : {
        webServer: [
          // The pages need the API: the backend's in-memory dev server,
          // seeded. Next reaches it through API_ORIGIN (server)
          // and API_PROXY_ORIGIN (browser).
          {
            command: "pnpm --dir ../backend run serve",
            // Its emails link to this run's site.
            env: { DEV_API_PORT: String(API_PORT), DEV_SITE_URL: ownUrl },
            url: `${API_ORIGIN}/api/health`,
            reuseExistingServer: false,
            timeout: 60_000,
          },
          {
            command: `pnpm start --port ${String(PORT)}`,
            // The server render's API origin, and the browser's /api and /media
            // proxy.
            env: { API_ORIGIN, API_PROXY_ORIGIN: API_ORIGIN },
            url: ownUrl,
            reuseExistingServer: false,
            timeout: 60_000,
          },
        ],
      }),
});
