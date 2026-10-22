import { type NextRequest, NextResponse } from "next/server";

import { actionRefusal } from "@/lib/action-request";
import { carriesOriginSecret } from "@/lib/data/origin-secret";

// Runs before every request the server answers.
//
// 1. With ORIGIN_SECRET set (every deployed stage), a request without the
//    matching origin secret is refused: only CloudFront sends it, so the
//    site's API Gateway address cannot serve anyone around basic auth and the
//    WAF. Unset, as in
//    `next dev` and e2e, nothing is refused.
// 2. A server action call Next would answer with a 500 (a foreign Origin, a
//    body over its limit, one React cannot decode) is refused as the 4xx it
//    is (src/lib/action-request.ts).
// 3. End-to-end tests only: with API_PROXY_ORIGIN set, /api/*
//    and /media/* go to the backend's dev server, as CloudFront will route
//    them in production. Unset, as in production and `next dev` (which
//    proxies through next.config.ts's rewrites), requests pass through.

// The API's and the bucket's paths, never the site's own.
const API_OR_MEDIA = /^\/(?:api|media)(?:\/|$)/;

export function proxy(request: NextRequest): NextResponse | Promise<NextResponse> {
  const originSecret = process.env.ORIGIN_SECRET;
  if (originSecret && !carriesOriginSecret(request.headers, originSecret)) {
    // Never cached: a refusal while a new secret rolls out must not outlive it.
    return new NextResponse("Forbidden", {
      headers: { "cache-control": "no-store" },
      status: 403,
    });
  }
  const { pathname, search } = request.nextUrl;
  if (request.method === "POST" && !API_OR_MEDIA.test(pathname)) {
    return actionGate(request, pathname, search);
  }
  return route(pathname, search);
}

async function actionGate(
  request: NextRequest,
  pathname: string,
  search: string,
): Promise<NextResponse> {
  const refusal = await actionRefusal(request);
  if (refusal === undefined) return route(pathname, search);
  return new NextResponse(null, { headers: { "cache-control": "no-store" }, status: refusal });
}

function route(pathname: string, search: string): NextResponse {
  const origin = process.env.API_PROXY_ORIGIN;
  if (!origin || !API_OR_MEDIA.test(pathname)) return NextResponse.next();
  return NextResponse.rewrite(new URL(`${pathname}${search}`, origin));
}
