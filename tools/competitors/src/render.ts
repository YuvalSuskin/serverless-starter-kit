// `pnpm competitors render`: open a page in headless
// Chromium, optionally scroll in lazy content or click "show more" open, and
// save the rendered HTML and a text-only version to the cache. Only the paths
// and sizes are printed: a page's contents never pass through the main session.
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { type Browser, chromium, type Page } from "playwright";

import { BLOCKING_STATUSES, CollectorBlocked, isChallengeTitle } from "./http.ts";

export const DEFAULT_CACHE = path.join(homedir(), ".cache", "acme", "competitors");

// Runs in the page, so it sees what the browser shows (C20): hidden elements
// are left out, except collapsed content a reader can open: the section a
// collapsed control points to (aria-expanded="false" with aria-controls) and
// the body of a <details> (akn.12); a block element starts a line; an inline-block control is set
// apart by spaces; a table row is one line of " | "-joined cells, empty cells
// kept; a list item starts with "- "; <br> ends a line, so two make a blank
// one. Scripts, styles, navigation and footers are left out.
const VISIBLE_TEXT = `(() => {
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "NAV", "FOOTER", "IFRAME", "svg"]);
  const lines = [];
  let current = "";
  const endLine = (always) => {
    const text = current.replace(/\\s+/g, " ").trim();
    if (text === "-") return;
    if (always || text !== "") lines.push(text);
    current = "";
  };
  const cell = (element) => element.innerText.replace(/\\s+/g, " ").trim();
  const collapsed = new Set();
  for (const control of document.querySelectorAll('[aria-expanded="false"][aria-controls]')) {
    for (const id of control.getAttribute("aria-controls").split(/\\s+/)) {
      const target = document.getElementById(id);
      if (target) collapsed.add(target);
    }
  }
  const walk = (node, opened = false) => {
    if (node.nodeType === Node.TEXT_NODE) { current += node.textContent; return; }
    if (node.nodeType !== Node.ELEMENT_NODE || SKIP.has(node.tagName)) return;
    const open = opened || collapsed.has(node) || node.tagName === "DETAILS";
    const style = getComputedStyle(node);
    if (!open && (node.hidden || style.display === "none" || style.visibility === "hidden")) return;
    if (node.tagName === "BR") { endLine(true); return; }
    if (node.tagName === "TR") { endLine(false); lines.push([...node.cells].map(cell).join(" | ")); return; }
    const inline = style.display.startsWith("inline") || style.display === "contents";
    const spaced = style.display.startsWith("inline-");
    if (!inline) endLine(false);
    if (node.tagName === "LI") current += "- ";
    if (spaced) current += " ";
    for (const child of node.childNodes) walk(child, open);
    if (spaced) current += " ";
    if (!inline) endLine(false);
  };
  walk(document.body);
  endLine(false);
  return lines.join("\\n").replace(/\\n{3,}/g, "\\n\\n").trim() + "\\n";
})()`;

// What a bot-check page says when it is served with a normal title.
const BLOCK_TEXT =
  /unusual traffic|are you a robot|verify (that )?you are (a )?human|complete the security check/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_STEM = 100;

const pause = (page: Page) => page.waitForTimeout(400);

/** Declines a cookie banner when it offers a way to; otherwise leaves it. */
async function declineCookies(page: Page): Promise<void> {
  const reject = page
    .getByRole("button", {
      name: /reject|decline|only necessary|necessary only|refuser|ablehnen|rechazar|rifiuta/i,
    })
    .first();
  if (await reject.isVisible().catch(() => false)) {
    await reject.click();
    await pause(page);
  }
}

/** Scrolls to the bottom until the page stops growing for two rounds (at most 30). */
async function scrollToEnd(page: Page): Promise<void> {
  let unchanged = 0;
  for (let round = 0; round < 30 && unchanged < 2; round += 1) {
    // Expressions run in the page; this package has no DOM types of its own.
    const before = await page.evaluate<number>("document.body.scrollHeight");
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await pause(page);
    const after = await page.evaluate<number>("document.body.scrollHeight");
    unchanged = after === before ? unchanged + 1 : 0;
  }
}

/** Clicks the control with this exact text until it disappears (at most 50 times). */
async function clickUntilGone(page: Page, text: string): Promise<void> {
  for (let clicks = 0; clicks < 50; clicks += 1) {
    const control = page.getByText(text, { exact: true }).first();
    if (!(await control.isVisible().catch(() => false))) return;
    await control.click();
    await pause(page);
  }
}

/**
 * <date>-<host>-<path and query>, readable (a path in another script stays in it) and at
 * most 100 characters: a file's own name for file: URLs.
 */
export function fileStem(url: URL, today: string): string {
  let where =
    url.protocol === "file:" ? path.basename(url.pathname) : `${url.pathname}${url.search}`;
  try {
    where = decodeURIComponent(where);
  } catch {
    // Not valid percent-encoding: keep it as it came.
  }
  const head = `${today}-${url.hostname || "local"}-`;
  const slug =
    where
      .toLowerCase()
      .replaceAll(/[^\p{L}\p{N}]+/gu, "-")
      .replaceAll(/^-|-$/g, "") || "home";
  return head + slug.slice(0, MAX_STEM - head.length).replace(/-$/, "");
}

interface RenderOptions {
  cacheDir?: string;
  click?: string;
  launch?: () => Promise<Browser>;
  scroll: boolean;
  slug: string;
  today?: string;
}

export async function renderPage(
  address: string,
  options: RenderOptions,
): Promise<{ bytes: { html: number; text: number }; html: string; text: string }> {
  const {
    cacheDir = DEFAULT_CACHE,
    click,
    launch = () => chromium.launch(),
    scroll,
    slug,
  } = options;
  if (!SLUG.test(slug)) throw new Error(`"${slug}" is not a competitor slug (kebab-case)`);
  const today = options.today ?? new Date().toLocaleDateString("sv-SE");
  const url = new URL(address);
  const where = url.hostname || "page";
  const browser = await launch();
  try {
    const page = await browser.newPage({ locale: "he-IL" });
    const response = await page.goto(url.href, { timeout: 30_000, waitUntil: "load" });
    const status = response?.status();
    if (status !== undefined && BLOCKING_STATUSES.has(status))
      throw new CollectorBlocked(where, `HTTP ${String(status)}`);
    if (isChallengeTitle(await page.title())) throw new CollectorBlocked(where, "a challenge page");
    await declineCookies(page);
    if (scroll) await scrollToEnd(page);
    if (click !== undefined) await clickUntilGone(page, click);
    const text = await page.evaluate<string>(VISIBLE_TEXT);
    if (BLOCK_TEXT.test(text)) throw new CollectorBlocked(where, "a bot-check page");
    const html = await page.content();
    const folder = path.join(cacheDir, slug);
    mkdirSync(folder, { recursive: true });
    const stem = path.join(folder, fileStem(url, today));
    writeFileSync(`${stem}.html`, html);
    writeFileSync(`${stem}.txt`, text);
    return {
      bytes: { html: Buffer.byteLength(html), text: Buffer.byteLength(text) },
      html: `${stem}.html`,
      text: `${stem}.txt`,
    };
  } finally {
    await browser.close();
  }
}
