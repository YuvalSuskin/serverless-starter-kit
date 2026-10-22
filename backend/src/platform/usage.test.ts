import { describe, expect, it } from "vitest";

import { fakeClock } from "../fakes/clock";
import { recordingLogger } from "../fakes/logger";
import { withLogContext } from "./log-context";
import { createUsage } from "./usage";

describe("usage", () => {
  it("writes one attributed usage line per record", () => {
    const log = recordingLogger();
    const usage = createUsage(log, () => fakeClock().now());
    withLogContext({ correlationId: "c1", principal: "anonymous", unitId: "demo" }, () => {
      usage.record("messages.write_units", 2);
    });
    expect(log.lines).toEqual([
      {
        fields: {
          at: "2026-01-01T00:00:00.000Z",
          correlationId: "c1",
          meter: "messages.write_units",
          principal: "anonymous",
          quantity: 2,
          type: "usage",
          unitId: "demo",
        },
        level: "info",
        message: "usage",
      },
    ]);
  });

  it("counts one when no quantity is given", () => {
    const log = recordingLogger();
    const usage = createUsage(log, () => fakeClock().now());
    withLogContext({ correlationId: "c1", principal: "anonymous", unitId: "demo" }, () => {
      usage.record("email.sent");
    });
    expect(log.lines[0]?.fields).toMatchObject({ meter: "email.sent", quantity: 1 });
  });

  // Root CLAUDE.md: a cost that cannot be split by unit is still measured,
  // as a shared cost.
  it("writes a shared usage line, with no unit to attribute it to", () => {
    const log = recordingLogger();
    const usage = createUsage(log, () => fakeClock().now());
    withLogContext({ correlationId: "c1", principal: "anonymous" }, () => {
      usage.recordShared("example.shared");
    });
    expect(log.lines).toEqual([
      {
        fields: {
          at: "2026-01-01T00:00:00.000Z",
          correlationId: "c1",
          meter: "example.shared",
          principal: "anonymous",
          quantity: 1,
          shared: true,
          type: "usage",
        },
        level: "info",
        message: "usage",
      },
    ]);
  });

  it("refuses a record it could not attribute to a unit", () => {
    const log = recordingLogger();
    const usage = createUsage(log, () => new Date(0));
    expect(() => {
      withLogContext({ correlationId: "c1", principal: "anonymous" }, () => {
        usage.record("email.sent");
      });
    }).toThrow(/no unitId/);
    expect(() => {
      usage.record("email.sent");
    }).toThrow(/no unitId/);
    expect(log.lines).toEqual([]);
  });
});
