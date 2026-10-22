import type { Clock } from "../platform/clock";

export interface FakeClock extends Clock {
  advance(milliseconds: number): void;
}

// Time stands still until a test moves it.
export function fakeClock(start = "2026-01-01T00:00:00.000Z"): FakeClock {
  let current = new Date(start).getTime();
  return {
    advance: (milliseconds) => {
      current += milliseconds;
    },
    now: () => new Date(current),
  };
}
