// Skeleton: `pnpm smoke --stage <name>`: the deployed stage answers as it
// should. Run through `sst shell`, which hands it the stage's address and
// secrets as environment variables; it prints statuses only, never a
// credential. It sends no message: the only call that writes is one the API
// must refuse.
import { CORRELATION_ID_HEADER, ORIGIN_SECRET_HEADER } from "@acme/contracts/client/core";

import { missingSecurityHeaders } from "../src/cdn.ts";
import { basicAuthHeader } from "../src/edge.ts";
import { stageArgument, stopWithoutAccounts } from "./args.ts";
import { inStageShell, resource } from "./stage-resources.ts";

stopWithoutAccounts(process.argv);
const stage = stageArgument(process.argv);
inStageShell(stage, "scripts/smoke.ts", ["--stage", stage]);

const base = resource("Cdn")?.url;
if (base === undefined) throw new Error("The stage has no Cdn router: is it deployed?");
const password = resource("BasicAuthPassword")?.value;
const auth: Record<string, string> = password ? { authorization: basicAuthHeader(password) } : {};

let failures = 0;
async function check(
  name: string,
  path: string,
  expect: (response: Response, body: string) => string | undefined,
  headers: Record<string, string> = auth,
  init: { body?: string; method?: string } = {},
) {
  // A path is on the stage's CloudFront address; a full URL is elsewhere.
  const response = await fetch(new URL(path, base), {
    ...init,
    headers,
    method: init.method ?? "GET",
    redirect: "manual",
  });
  const body = await response.text();
  const problem = expect(response, body);
  const cache = response.headers.get("x-cache") ?? "-";
  console.log(
    `${problem ? "FAIL" : "ok  "} ${String(response.status)} ${cache.padEnd(24)} ${name}`,
  );
  if (problem) {
    console.log(`     ${problem}`);
    failures += 1;
  }
}

const status = (want: number) => (r: Response) =>
  r.status === want ? undefined : `expected ${String(want)}`;

if (password) {
  await check("no credentials: basic auth asks", "/", status(401), {});
  await check("wrong credentials: refused", "/", status(401), {
    authorization: basicAuthHeader("not-the-password-at-all"),
  });
}
await check("API health", "/api/health", (r, body) =>
  r.status === 200 && body.includes('"ok"') ? undefined : 'expected 200 {"status":"ok"}',
);
// The list reads the table: it proves the API reaches DynamoDB.
await check("API list of messages: answers from the table", "/api/public/messages", (r, body) => {
  if (r.status !== 200) return "expected 200";
  return Array.isArray((JSON.parse(body) as { items?: unknown }).items)
    ? undefined
    : "expected a page with items";
});
// A write the API must refuse, so nothing is stored or mailed.
await check(
  "API send with an empty body: refused, nothing stored",
  "/api/public/messages",
  status(400),
  { ...auth, "content-type": "application/json" },
  { body: "{}", method: "POST" },
);
let asset: string | undefined;
await check("the contact page", "/contact", (r, body) => {
  asset = /\/_next\/static\/[^"']+\.(?:css|js)/.exec(body)?.[0];
  return r.status === 200 ? undefined : "expected 200";
});
// The distribution's security headers, on a page and on the API's JSON; no
// x-powered-by.
await check("the contact page: the security headers, no x-powered-by", "/contact", (r) =>
  missingSecurityHeaders(r.headers),
);
await check("API health: the security headers", "/api/health", (r) =>
  missingSecurityHeaders(r.headers),
);
// An encoded `..` would reach another API route; the edge refuses it before
// any origin.
await check(
  "API: an encoded .. to another route, refused at the edge",
  "/api/public/messages/..%2f..%2fhealth",
  (r) =>
    r.status === 400 && !r.headers.has(CORRELATION_ID_HEADER)
      ? undefined
      : "expected the edge's 400, not the API's answer",
);
await check("a hashed file from the site bucket, cached for a year", asset ?? "/_next/none", (r) =>
  r.status === 200 && (r.headers.get("cache-control") ?? "").includes("immutable")
    ? undefined
    : "expected 200 with an immutable cache-control",
);
await check("the messages page answers", "/messages", status(200));

// Only CloudFront reaches the origins: each API Gateway default address
// refuses a request without the origin secret, around basic auth. With it,
// each answers, so a refusal above is the secret check and not a broken
// origin.
const originSecret = resource("OriginSecret")?.value;
for (const [name, gateway, path] of [
  ["the API's API Gateway address", resource("ApiGateway")?.url, "/api/health"],
  ["the site's API Gateway address", resource("WebGateway")?.url, "/contact"],
] as const) {
  if (gateway === undefined || !originSecret) {
    console.log(`FAIL ${name}: not in the stage's resources`);
    failures += 1;
    continue;
  }
  const url = new URL(path, gateway).toString();
  await check(`${name} without the origin secret: refused`, url, status(403), {});
  await check(`${name} with a wrong origin secret: refused`, url, status(403), {
    [ORIGIN_SECRET_HEADER]: "not-the-origin-secret",
  });
  await check(`${name} with the origin secret: answers`, url, status(200), {
    [ORIGIN_SECRET_HEADER]: originSecret,
  });
}

if (failures > 0) {
  console.log(`${String(failures)} check(s) failed.`);
  process.exit(1);
}
console.log("Smoke test passed.");
