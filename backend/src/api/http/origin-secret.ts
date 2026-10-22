import { ORIGIN_SECRET_HEADER } from "@acme/contracts";
import { createHash, timingSafeEqual } from "node:crypto";

// Whether a request carries the origin secret: CloudFront sets it on every request, the site's server render sends it,
// and nobody else knows it. Compared by digest, so the time taken says
// nothing about the secret, whatever the lengths.
export function carriesOriginSecret(
  header: (name: string) => string | undefined,
  originSecret: string,
): boolean {
  const given = header(ORIGIN_SECRET_HEADER);
  if (given === undefined) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(originSecret));
}
