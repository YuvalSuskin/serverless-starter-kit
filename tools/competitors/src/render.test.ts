import type { AddressInfo } from "node:net";

import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CollectorBlocked } from "./http.ts";
import { fileStem, renderPage } from "./render.ts";

const page = (name: string) =>
  pathToFileURL(path.join(import.meta.dirname, "fixtures/render", `${name}.html`)).href;
const cache = () => mkdtempSync(path.join(tmpdir(), "competitors-render-"));

describe("the text version", () => {
  it("is what a reader sees: blocks on their own lines, controls apart, table rows with empty cells, list items, no hidden text", async () => {
    const saved = await renderPage(page("structure"), {
      cacheDir: cache(),
      scroll: false,
      slug: "alpha",
      today: "2026-10-05",
    });
    const text = readFileSync(saved.text, "utf8");
    expect(text).toContain("Plans\n");
    expect(text).not.toContain("Basic plan$350");
    expect(text).toContain("Try free Book a demo");
    expect(text).toContain("Feature | Basic | Pro\nBackup |  | ✓");
    expect(text).toContain("- Private space\n- Live view");
    expect(text).toContain("Line\n\nAfter a blank line");
    expect(text).not.toMatch(/Old price|Ended offer|All rights reserved/);
  }, 60_000);

  it("includes collapsed FAQ answers and <details>, but no other hidden text (akn.12)", async () => {
    const saved = await renderPage(page("structure"), {
      cacheDir: cache(),
      scroll: false,
      slug: "alpha",
      today: "2026-10-05",
    });
    const text = readFileSync(saved.text, "utf8");
    expect(text).toContain("How long are files kept?\nSix months, with an option to extend.");
    expect(text).toContain("There is no limit on files.");
    expect(text).not.toMatch(/English|Old price|Ended offer/);
  }, 60_000);

  it("leaves a cookie banner alone when it offers no way to decline", async () => {
    const saved = await renderPage(page("structure"), {
      cacheDir: cache(),
      scroll: false,
      slug: "alpha",
      today: "2026-10-05",
    });
    expect(readFileSync(saved.text, "utf8")).not.toContain("Cookies: accepted");
  }, 60_000);
});

describe("cache file names", () => {
  const stem = (url: string) => fileStem(new URL(url), "2026-10-05");

  it("keeps a path in another script readable, folds in the query, and stays short", () => {
    expect(stem("https://a.example/%CF%84%CE%B9%CE%BC%CE%AD%CF%82")).toBe(
      "2026-10-05-a.example-τιμές",
    );
    expect(stem("https://a.example/p?plan=a")).not.toBe(stem("https://a.example/p?plan=b"));
    expect(stem(`https://a.example/${"%CE%B1".repeat(120)}`).length).toBeLessThanOrEqual(100);
  });
});

describe("renderPage", () => {
  it("scrolls in lazy content, clicks 'show more' open, declines cookies, and saves HTML and text", async () => {
    const dir = cache();
    const saved = await renderPage(page("lazy"), {
      cacheDir: dir,
      click: "Show more",
      scroll: true,
      slug: "alpha",
      today: "2026-10-05",
    });
    expect(saved.text).toBe(path.join(dir, "alpha", "2026-10-05-local-lazy-html.txt"));
    expect(saved.html).toBe(path.join(dir, "alpha", "2026-10-05-local-lazy-html.html"));
    const text = readFileSync(saved.text, "utf8");
    expect(text).toContain("Loaded on scroll 2");
    expect(text).toContain("Hidden item 2");
    expect(text).toContain("Cookies: rejected");
    expect(text).not.toContain("Cookies: accepted");
    expect(saved.bytes.text).toBe(Buffer.byteLength(text));
    expect(existsSync(saved.html)).toBe(true);
  }, 60_000);

  it("leaves lazy content alone without --scroll", async () => {
    const saved = await renderPage(page("lazy"), {
      cacheDir: cache(),
      scroll: false,
      slug: "alpha",
      today: "2026-10-05",
    });
    expect(readFileSync(saved.text, "utf8")).not.toContain("Loaded on scroll");
  }, 60_000);

  it("stops on a challenge page", async () => {
    await expect(
      renderPage(page("challenge"), { cacheDir: cache(), scroll: false, slug: "alpha" }),
    ).rejects.toThrow(CollectorBlocked);
  }, 60_000);
});

describe("renderPage: blocks and bad input", () => {
  let base = "";
  const server = createServer((request, response) => {
    const pages: Record<string, [number, string]> = {
      "/blocked": [
        403,
        "<html><head><title>Sorry</title></head><body>You have been blocked</body></html>",
      ],
      "/form": [
        200,
        '<html><head><title>Contact us</title></head><body><h1>Contact us</h1><div class="g-recaptcha"></div></body></html>',
      ],
      "/unusual": [
        200,
        "<html><head><title>Search</title></head><body><p>Our systems have detected unusual traffic from your computer network.</p></body></html>",
      ],
    };
    const [status, body] = pages[request.url ?? ""] ?? [404, ""];
    response.writeHead(status, { "content-type": "text/html; charset=utf-8" }).end(body);
  });
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });
  afterAll(() => {
    server.close();
  });

  it.each(["/blocked", "/unusual"])(
    "stops on %s",
    async (route) => {
      await expect(
        renderPage(`${base}${route}`, { cacheDir: cache(), scroll: false, slug: "alpha" }),
      ).rejects.toThrow(CollectorBlocked);
    },
    60_000,
  );

  it("does not mistake a contact form's CAPTCHA for a block", async () => {
    const saved = await renderPage(`${base}/form`, {
      cacheDir: cache(),
      scroll: false,
      slug: "alpha",
    });
    expect(readFileSync(saved.text, "utf8")).toContain("Contact us");
  }, 60_000);

  it("refuses a slug that could leave the cache", async () => {
    await expect(
      renderPage(page("lazy"), { cacheDir: cache(), scroll: false, slug: "../x" }),
    ).rejects.toThrow(/slug/);
  });
});
