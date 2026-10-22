interface RawRequestEnv {
  /** API Gateway's HTTP API event (hono/aws-lambda): the path as CloudFront sent it, decoded. */
  event?: { rawPath?: string; rawQueryString?: string };
  /** Node's request (@hono/node-server): its URL as sent. */
  incoming?: { url?: string };
}

/** The path and query as the caller sent them: never Hono's decoded, normalised form. */
export function rawTarget(c: { env: unknown; req: { url: string } }): {
  path: string;
  query: string;
} {
  const env = c.env as RawRequestEnv | undefined;
  if (env?.event?.rawPath !== undefined) {
    return { path: env.event.rawPath, query: env.event.rawQueryString ?? "" };
  }
  const url = new URL(c.req.url);
  const raw = env?.incoming?.url ?? `${url.pathname}${url.search}`;
  const mark = raw.indexOf("?");
  return mark < 0
    ? { path: raw, query: "" }
    : { path: raw.slice(0, mark), query: raw.slice(mark + 1) };
}

/**
 * Whether a path, decoded as often as it is encoded, holds a dot segment or
 * a backslash. API Gateway decodes the path and the Request resolves its dot
 * segments, so /api/public/things/..%2f..%2fhealth would answer as
 * /api/health; no route's path holds either.
 */
export function traversing(path: string): boolean {
  let decoded = path;
  for (let round = 0; round < 3 && decoded.includes("%"); round += 1) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return true;
    }
  }
  return decoded.includes("%") || decoded.split(/[/\\]/).some((s) => s === "." || s === "..");
}
