// The only way a collector reaches a source: one request
// at a time per host with a pause between them, a timeout, and never a retry.
// A block (HTTP 403/429/503, a challenge page, a timeout) stops the collector:
// we never work around one.

export type Fetcher = (url: string) => Promise<{ body: string; status: number }>;

export class CollectorBlocked extends Error {
  constructor(source: string, reason: string) {
    super(`${source}: blocked (${reason}); nothing more is collected from it this run`);
    this.name = "CollectorBlocked";
  }
}

export const BLOCKING_STATUSES = new Set([403, 429, 503]);
// Titles of the interstitials bot protection serves in place of a page.
const CHALLENGE_TITLE = /^\s*(just a moment|attention required|access denied|security check)/i;

export function isChallengeTitle(title: string): boolean {
  return CHALLENGE_TITLE.test(title);
}

interface Options {
  fetch?: typeof globalThis.fetch;
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  source: string;
  timeoutMs?: number;
}

export function politeFetcher(options: Options): Fetcher {
  const {
    fetch = globalThis.fetch,
    minIntervalMs = 1500,
    now = Date.now,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    source,
    timeoutMs = 30_000,
  } = options;
  const lastRequest = new Map<string, number>();
  // Each host's requests run one after another, even when called concurrently.
  const queues = new Map<string, Promise<unknown>>();

  const request = async (url: string, host: string) => {
    const previous = lastRequest.get(host);
    if (previous !== undefined) {
      const wait = previous + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
    }
    lastRequest.set(host, now());

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new CollectorBlocked(source, `timed out after ${String(timeoutMs)} ms`);
      }
      throw error;
    }
    if (BLOCKING_STATUSES.has(response.status))
      throw new CollectorBlocked(source, `HTTP ${String(response.status)}`);
    let body: string;
    try {
      body = await response.text();
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new CollectorBlocked(source, `timed out after ${String(timeoutMs)} ms`);
      }
      throw error;
    }
    const title = /<title[^>]*>([^<]*)/i.exec(body.slice(0, 4000))?.[1] ?? "";
    if (isChallengeTitle(title)) throw new CollectorBlocked(source, "a challenge page");
    return { body, status: response.status };
  };

  return (url) => {
    const host = new URL(url).host;
    const turn = (queues.get(host) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => request(url, host));
    queues.set(host, turn);
    return turn;
  };
}
