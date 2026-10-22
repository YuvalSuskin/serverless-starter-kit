// The route-free half of the client: the types and constants a page
// needs to call a route, and nothing that names one. Each audience's table
// (public.ts today, one more per audience added later) imports only this, so
// a page that calls one audience bundles only that audience's routes. No zod,
// and no side effects (the package says "sideEffects": false), so importing a
// constant pulls in only the constant.

/** The skeleton has one audience; a project adds one here per kind of caller. */
export type Audience = "public";
export type Method = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export interface RouteDescriptor {
  readonly audience: Audience;
  readonly method: Method;
  readonly path: string;
}

// Sent back on every response; accepted from the client when valid.
export const CORRELATION_ID_HEADER = "x-correlation-id";

// The secret CloudFront adds to every origin request, and the site's server
// render adds to its API calls. Only beside
// it is VIEWER_ADDRESS_HEADER trusted.
export const ORIGIN_SECRET_HEADER = "x-origin-secret";

// The visitor's `ip:port`, set by CloudFront (its origin request policy must
// forward it) and passed on by the server render.
export const VIEWER_ADDRESS_HEADER = "cloudfront-viewer-address";

// The `:name` segments of a path, in order.
export function pathParams(path: string): string[] {
  return path
    .split("/")
    .filter((segment) => segment.startsWith(":"))
    .map((segment) => segment.slice(1));
}

// Fills a route's path with URL-encoded parameters. encodeURIComponent leaves
// "." and ".." alone and the URL parser collapses them (and an empty value
// merges two segments), so /things/../access would call another route.
export function buildPath(route: RouteDescriptor, params: Record<string, string>): string {
  return route.path
    .split("/")
    .map((segment) => {
      if (!segment.startsWith(":")) return segment;
      const value = params[segment.slice(1)];
      if (value === undefined || value === "" || value === "." || value === "..")
        throw new Error(`Missing or unusable path parameter ${segment} for ${route.path}`);
      return encodeURIComponent(value);
    })
    .join("/");
}
