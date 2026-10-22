import type { Clock } from "../platform/clock";
import type { Ids } from "../platform/ids";
import type { Logger } from "../platform/logger";
import type { Metrics } from "../platform/metrics";
import type { Random } from "../platform/random";
import type { Usage } from "../platform/usage";

/** What every use-case and route can use, whatever unit it works on. */
export interface Platform {
  clock: Clock;
  ids: Ids;
  log: Logger;
  metrics: Metrics;
  /** Tokens, OAuth state, nonces: random in production, deterministic in tests. */
  random: Random;
  usage: Usage;
}
