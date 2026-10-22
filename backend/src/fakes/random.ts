import type { Random } from "../platform/random";

import { sha256Base64url } from "../platform/random";

// Deterministic tokens of the real shape: the hash of a counter.
export function sequentialRandom(): Random {
  let n = 0;
  return {
    token: () => {
      n += 1;
      return sha256Base64url(`fake-random-${n.toString()}`);
    },
  };
}
