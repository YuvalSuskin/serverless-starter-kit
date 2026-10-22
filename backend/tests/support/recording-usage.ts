import type { Usage } from "../../src/platform/usage";

export interface Metered {
  meter: string;
  quantity: number;
}

/** A Usage that keeps what it is given: a contract suite has no log context to attribute to. */
export function recordingUsage(): { records: Metered[]; usage: Usage } {
  const records: Metered[] = [];
  return {
    records,
    usage: {
      record: (meter, quantity = 1) => {
        records.push({ meter, quantity });
      },
      recordShared: (meter, quantity = 1) => {
        records.push({ meter, quantity });
      },
    },
  };
}
