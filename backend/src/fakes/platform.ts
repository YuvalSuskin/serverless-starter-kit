import type { Platform } from "../domain/platform";
import type { Clock } from "../platform/clock";
import type { Ids } from "../platform/ids";
import type { Random } from "../platform/random";

import { createUsage } from "../platform/usage";
import { type FakeClock, fakeClock } from "./clock";
import { sequentialIds } from "./ids";
import { recordingLogger } from "./logger";
import { recordingMetrics } from "./metrics";
import { sequentialRandom } from "./random";

interface FakePlatformOptions<C extends Clock> {
  /** Replaces the fake clock: the dev server runs on real time. */
  clock?: C;
  ids?: Ids;
  /** Replaces the deterministic tokens: the dev server makes real ones. */
  random?: Random;
  /** Print log lines instead of keeping them (the dev server). */
  print?: boolean;
}

// The whole platform, faked: deterministic time and ids, and every log line,
// usage record and metric kept for inspection.
export function fakePlatform<C extends Clock = FakeClock>(options: FakePlatformOptions<C> = {}) {
  const clock = options.clock ?? (fakeClock() as Clock as C);
  const log = recordingLogger({ print: options.print });
  const metrics = recordingMetrics();
  const platform: Platform = {
    clock,
    ids: options.ids ?? sequentialIds(),
    log,
    metrics,
    random: options.random ?? sequentialRandom(),
    usage: createUsage(log, () => clock.now()),
  };
  return { clock, log, metrics, platform };
}
