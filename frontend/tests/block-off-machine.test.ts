// The offline step's browser block, in a real Chromium: HTTP and WebSocket
// requests off this machine are refused and recorded; this machine's are not.
import { chromium } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { blockOffMachine } from "../e2e/block-off-machine";

vi.setConfig({ testTimeout: 30_000 });

let server: Server;
let origin: string;
beforeAll(async () => {
  server = createServer((_request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    response.end("local");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${String(typeof address === "object" && address !== null ? address.port : 0)}`;
});
afterAll(() => {
  server.close();
});

async function inChromium<T>(
  run: (blocked: string[], page: import("@playwright/test").Page) => Promise<T>,
) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const blocked = await blockOffMachine(context);
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    return await run(blocked, page);
  } finally {
    await browser.close();
  }
}

describe("blockOffMachine", () => {
  it("aborts and records a request to another machine", async () => {
    await inChromium(async (blocked, page) => {
      const outcome = await page.evaluate(() =>
        fetch("https://fonts.example.test/css").then(
          () => "answered",
          () => "failed",
        ),
      );
      expect(outcome).toBe("failed");
      expect(blocked).toEqual(["https://fonts.example.test/css"]);
    });
  });

  it("aborts and records a WebSocket to another machine", async () => {
    await inChromium(async (blocked, page) => {
      const outcome = await page.evaluate(
        () =>
          new Promise<string>((resolve) => {
            const socket = new WebSocket("wss://live.example.test/feed");
            socket.addEventListener("open", () => {
              resolve("open");
            });
            socket.addEventListener("close", () => {
              resolve("closed");
            });
          }),
      );
      expect(outcome).toBe("closed");
      expect(blocked).toEqual(["wss://live.example.test/feed"]);
    });
  });

  it("lets this machine through, and records nothing", async () => {
    await inChromium(async (blocked, page) => {
      const text = await page.evaluate((url) => fetch(url).then((r) => r.text()), `${origin}/x`);
      expect(text).toBe("local");
      expect(blocked).toEqual([]);
    });
  });
});
