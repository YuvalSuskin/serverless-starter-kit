// Google reviews through SerpApi. SerpApi collects on our
// behalf (owner, 2026-09-29). Each request is one search from the monthly
// quota, so a run stops at a cap. The reviewer (`user`) is never read, and the
// key never appears in an error.
import type { Fetcher } from "../http.ts";
import type { ReviewCollection } from "../ingest.ts";

const ENDPOINT = "https://serpapi.com/search.json";
const PAGE_SIZE = "20"; // SerpApi allows `num` only after the first page.

interface SerpReview {
  extracted_snippet?: { original?: string };
  iso_date?: string;
  link?: string;
  rating?: number;
  review_id?: string;
  snippet?: string;
}

interface SerpPage {
  error?: string;
  place_info?: { reviews?: number };
  reviews?: SerpReview[];
  serpapi_pagination?: { next_page_token?: string };
}

function searchUrl(params: Record<string, string>, key: string): string {
  const url = new URL(ENDPOINT);
  for (const [name, value] of Object.entries({ ...params, api_key: key }))
    url.searchParams.set(name, value);
  return url.toString();
}

/** One SerpApi search; any failure message has the key removed. */
async function search<T>(
  fetcher: Fetcher,
  params: Record<string, string>,
  key: string,
): Promise<T> {
  const redact = (text: string) => text.replaceAll(key, "[key]");
  const { body, status } = await fetcher(searchUrl(params, key));
  let json: T & { error?: string };
  try {
    json = JSON.parse(body) as T & { error?: string };
  } catch {
    throw new Error(`google: SerpApi answered HTTP ${String(status)} with a body that is not JSON`);
  }
  if (json.error !== undefined) throw new Error(`google: SerpApi: ${redact(json.error)}`);
  if (status !== 200) throw new Error(`google: SerpApi answered HTTP ${String(status)}`);
  return json;
}

type CollectedReview = ReviewCollection["records"][number];

function toRecord(review: SerpReview): CollectedReview {
  if (!review.review_id) throw new Error("google: layout changed: a review has no review_id");
  return {
    posted: review.iso_date?.slice(0, 10) ?? null,
    rating: review.rating ?? null,
    rating_scale: review.rating === undefined ? null : 5,
    source_id: review.review_id,
    text: review.extracted_snippet?.original ?? review.snippet ?? "",
    url: review.link ?? null,
  };
}

/** A first page must say how many reviews the place has, and list some. */
function checkFirstPage(page: SerpPage): number {
  const stated = page.place_info?.reviews;
  if (stated === undefined || !Array.isArray(page.reviews)) {
    throw new Error(
      "google: layout changed: the first page has no place_info.reviews count or no reviews list",
    );
  }
  return stated;
}

/** The country (`gl`) and interface language (`hl`) Google answers in: the market's. */
export interface Market {
  gl: string;
  hl: string;
}
export const DEFAULT_MARKET: Market = { gl: "us", hl: "en" };

export async function collectGoogle(
  place: { data_id: string },
  key: string,
  fetcher: Fetcher,
  options: { hl?: string; maxSearches?: number } = {},
): Promise<ReviewCollection & { searchesUsed: number; statedCount: number; stopped: string }> {
  const maxSearches = options.maxSearches ?? 30; // A cost bound: each search is billed.
  const base = {
    data_id: place.data_id,
    engine: "google_maps_reviews",
    hl: options.hl ?? DEFAULT_MARKET.hl,
    sort_by: "newestFirst",
  };
  const first = await search<SerpPage>(fetcher, base, key);
  const statedCount = checkFirstPage(first);
  const records: CollectedReview[] = [];
  const seen = new Set<string>();
  /** Adds a page's new reviews; returns how many were new. */
  const take = (page: SerpPage) => {
    const fresh = (page.reviews ?? [])
      .map(toRecord)
      .filter((record) => !seen.has(record.source_id ?? ""));
    for (const record of fresh) seen.add(record.source_id ?? "");
    records.push(...fresh);
    return fresh.length;
  };
  take(first);
  let searchesUsed = 1;
  let token = first.serpapi_pagination?.next_page_token;
  let stopped = "end of reviews";
  while (token !== undefined) {
    if (searchesUsed >= maxSearches) {
      stopped = `search cap (${String(maxSearches)}) reached`;
      break;
    }
    let page: SerpPage;
    try {
      searchesUsed += 1;
      page = await search<SerpPage>(
        fetcher,
        { ...base, next_page_token: token, num: PAGE_SIZE },
        key,
      );
    } catch (error) {
      if (error instanceof Error && error.name === "CollectorBlocked") throw error;
      stopped = `a later page failed: ${(error as Error).message}`;
      break; // What we have is kept, marked incomplete.
    }
    if (take(page) === 0) {
      stopped = "a page added no new review";
      break;
    }
    token = page.serpapi_pagination?.next_page_token;
  }
  const complete = stopped === "end of reviews" && records.length >= statedCount;
  return { complete, records, searchesUsed, source: "google", statedCount, stopped };
}

export async function findGooglePlaces(
  query: string,
  key: string,
  fetcher: Fetcher,
  market: Market = DEFAULT_MARKET,
): Promise<
  {
    address?: string;
    data_id: string;
    place_id?: string;
    reviews?: number;
    title: string;
    type?: string;
    website?: string;
  }[]
> {
  interface Place {
    address?: string;
    data_id: string;
    place_id?: string;
    reviews?: number;
    title: string;
    type?: string;
    website?: string;
  }
  const json = await search<{ local_results?: Place[]; place_results?: Place }>(
    fetcher,
    { engine: "google_maps", gl: market.gl, hl: market.hl, q: query, type: "search" },
    key,
  );
  const places = json.local_results ?? (json.place_results ? [json.place_results] : []);
  return places.map(({ address, data_id, place_id, reviews, title, type, website }) => ({
    address,
    data_id,
    place_id,
    reviews,
    title,
    type,
    website,
  }));
}
