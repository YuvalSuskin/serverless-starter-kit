import { describe, expect, it } from "vitest";

import { sha256Base64url } from "./random";

describe("random helpers", () => {
  // RFC 7636, appendix B: the S256 challenge of the example verifier.
  it("hashes as PKCE's S256 does", () => {
    expect(sha256Base64url("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});
