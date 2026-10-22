// Skeleton: the Next.js site from OpenNext's build output. SST's own Nextjs
// component serves the site through a Lambda function URL, and function URLs
// do not exist in every region, so the stack wires OpenNext's output itself:
// the server Lambda behind an API Gateway HTTP API, static files in a bucket,
// both behind the router. It works in any region.
import { copyFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Relative to deploy/, where SST runs. */
export const OPEN_NEXT_DIR = "../frontend/.open-next";
export const SERVER_BUNDLE = `${OPEN_NEXT_DIR}/server-functions/default`;

/**
 * Build files never published: OpenNext's BUILD_ID, and MSW's worker, which
 * only tests and Storybook use.
 */
const NOT_PUBLISHED = ["BUILD_ID", "mockServiceWorker.js"];

/**
 * The site Lambda's entry: functions/web-server/start.mjs, which wakes the
 * API before OpenNext's server loads, then hands every request to OpenNext's
 * own handler.
 */
const SERVER_START_SOURCE = "functions/web-server/start.mjs";
export const SERVER_START_FILE = "acme-start.mjs";
export const SERVER_HANDLER = "acme-start.handler";

/** Puts the entry beside OpenNext's index.mjs; each OpenNext build empties the folder, so after every build. */
export function installServerStart(serverBundle: string, source = SERVER_START_SOURCE): void {
  copyFileSync(source, join(serverBundle, SERVER_START_FILE));
}

/** Where OpenNext's S3 incremental cache keeps prerendered pages, in the assets bucket. */
export const CACHE_PREFIX = "_cache";

export function buildId(openNextDir: string): string {
  return readFileSync(join(openNextDir, "assets", "BUILD_ID"), "utf8").trim();
}

/**
 * The router's paths that go straight to the assets bucket: /_next (hashed
 * JS, CSS, fonts) and every top-level entry of public/. Everything else goes
 * to the server.
 */
export function assetRoutes(openNextDir: string): string[] {
  return readdirSync(join(openNextDir, "assets"))
    .filter((name) => !NOT_PUBLISHED.includes(name))
    .map((name) => `/${name}`)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * The shell command that uploads a build: hashed files cached for a year,
 * public files cached at the edge until the next deploy's invalidation, and
 * the prerendered pages where the server's incremental cache reads them. No
 * --delete: a visitor still holding the previous page keeps finding its
 * hashed files.
 */
export function uploadCommand(openNextDir: string, bucket: string): string {
  const target = `s3://${bucket}`;
  return [
    `aws s3 sync ${openNextDir}/assets/_next ${target}/_next --cache-control "public,max-age=31536000,immutable" --only-show-errors`,
    `aws s3 sync ${openNextDir}/assets ${target} --exclude "_next/*" ${NOT_PUBLISHED.map((name) => "--exclude " + name).join(" ")} --cache-control "public,max-age=0,s-maxage=31536000,must-revalidate" --only-show-errors`,
    `aws s3 sync ${openNextDir}/cache ${target}/${CACHE_PREFIX} --only-show-errors`,
  ].join(" && ");
}

/** What the site's build reads: SITE_URL, baked into the prerendered pages. */
export function webBuildEnvironment(siteUrl: string): Record<string, string> {
  return { SITE_URL: siteUrl };
}

/**
 * What the server Lambda reads when it renders: the site's own address and
 * the API it reaches directly, with the origin secret that proves the call
 * came from the site.
 */
export function webServerEnvironment(input: {
  apiOrigin: string;
  bucket: string;
  originSecret: string;
  region: string;
  siteUrl: string;
}): Record<string, string> {
  return {
    ...serverCacheEnvironment(input.bucket, input.region),
    API_ORIGIN: input.apiOrigin,
    ORIGIN_SECRET: input.originSecret,
    SITE_URL: input.siteUrl,
  };
}

/** The server Lambda's environment for OpenNext's caches (open-next.config.ts). */
export function serverCacheEnvironment(bucket: string, region: string): Record<string, string> {
  return {
    CACHE_BUCKET_KEY_PREFIX: CACHE_PREFIX,
    CACHE_BUCKET_NAME: bucket,
    CACHE_BUCKET_REGION: region,
  };
}
