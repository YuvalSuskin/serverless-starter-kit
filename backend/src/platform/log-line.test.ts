import { describe, expect, it } from "vitest";

import { withLogContext } from "./log-context";
import { toLogLine } from "./log-line";

describe("toLogLine", () => {
  it("carries the log context on every line, without the caller passing it", () => {
    const line = withLogContext(
      {
        correlationId: "c1",
        principal: "anonymous",
        route: "GET /x",
        unitId: "demo",
      },
      () => toLogLine("info", "did a thing", { count: 3 }),
    );
    expect(line).toEqual({
      fields: {
        correlationId: "c1",
        count: 3,
        principal: "anonymous",
        route: "GET /x",
        unitId: "demo",
      },
      level: "info",
      message: "did a thing",
    });
  });

  it("redacts personal data a caller passes by mistake", () => {
    expect(toLogLine("warn", "oops", { phone: "050-0000000" }).fields).toEqual({
      phone: "[redacted]",
    });
  });
});
