import { randomBytes } from "node:crypto";

import type { Random } from "../../platform/random";

export const cryptoRandom: Random = { token: () => randomBytes(32).toString("base64url") };
