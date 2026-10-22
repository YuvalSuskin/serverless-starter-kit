import { ORIGIN_SECRET_HEADER } from "@acme/contracts/client/core";
import { createHash, timingSafeEqual } from "node:crypto";

// Whether a request carries the origin secret: CloudFront sets it on every request and nobody else knows it. Server
// code only (the proxy); not marked `server-only`, which
// the proxy's bundle cannot import. Compared by digest, so the time taken
// says nothing about the secret, whatever the lengths.
export function carriesOriginSecret(incoming: Pick<Headers, "get">, originSecret: string): boolean {
  const given = incoming.get(ORIGIN_SECRET_HEADER);
  if (given === null) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(originSecret));
}
