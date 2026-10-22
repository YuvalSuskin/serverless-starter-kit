import type { Ids } from "../platform/ids";

// Deterministic, valid UUIDv7-shaped ids: ...-7000-8000-000000000001, -2, ...
export function sequentialIds(): Ids {
  let n = 0;
  return {
    next: () => {
      n += 1;
      return `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
    },
  };
}
