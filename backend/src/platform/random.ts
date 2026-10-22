import { createHash } from "node:crypto";

// Secrets the server makes up: session tokens, OAuth state, nonces and PKCE
// verifiers. Domain code takes them from deps, like time
// and ids, so tests are deterministic.
export interface Random {
  /** 256 random bits, base64url: 43 characters. */
  token(): string;
}

/** SHA-256, base64url: a session token's stored form, and a PKCE challenge (RFC 7636, S256). */
export function sha256Base64url(text: string): string {
  return createHash("sha256").update(text).digest("base64url");
}
