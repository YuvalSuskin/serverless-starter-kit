import type { Logger } from "./logger";

import { currentLogContext } from "./log-context";

// The meter catalog. A meter is added here, in review, before any
// code can record it. Adapters for paid services add theirs with the feature.
// A meter is named `<service>.<what is counted>` and says in its comment who
// records it and what the provider bills for it.
type Meter =
  // One email the provider accepted for delivery:
  // SES bills each, $0.10 or $0.16 per 1,000 by the account's plan. Recorded
  // by the Mailer adapter in the caller's context (the unit the mail is for).
  | "email.sent"
  // Skeleton: the template's demo meter, replaced by bootstrap step 6.
  // The DynamoDB write units a contact message costs to store, recorded by
  // the message store's adapter against the one demo unit (a started KB each).
  | "messages.write_units";

// Shared costs: paid work that belongs to no unit, so cannot be split by unit
// (root CLAUDE.md, "The cost of each unit is measurable"). Each is still
// measured, and named in the cost model as shared. Skeleton: the one below
// only shows the pattern; no code records it. Replace it with the first real
// shared meter (a scheduled job's Lambda time, a table scan, a WAF rule).
type SharedMeter = "example.shared";

export interface Usage {
  record(meter: Meter, quantity?: number): void;
  /** A shared cost: never attributed to a unit, so never billed to one. */
  recordShared(meter: SharedMeter, quantity?: number): void;
}

// One structured log line per record: `{ type: "usage", meter, quantity,
// unitId, at }`. A scheduled job rolls them up per unit per day, later. A
// record with no unitId would be unattributable, so it throws: every route
// and job sets the context first. A shared record says so (`shared: true`),
// and the roll-up keeps it apart.
export function createUsage(log: Logger, now: () => Date): Usage {
  return {
    record(meter, quantity = 1) {
      if (currentLogContext()?.unitId === undefined) {
        throw new Error(`Usage "${meter}" has no unitId to attribute it to`);
      }
      log.info("usage", { at: now().toISOString(), meter, quantity, type: "usage" });
    },
    recordShared(meter, quantity = 1) {
      log.info("usage", { at: now().toISOString(), meter, quantity, shared: true, type: "usage" });
    },
  };
}
