import { describe, expect, it } from "vitest";

import { recordingMetrics } from "../fakes/metrics";
import { defineMetricCatalog, METRICS } from "./metrics";

// A sample catalog: the real one ships empty.
const sample = defineMetricCatalog({
  "message.failed": { dimensions: { stage: ["validate", "store"] }, unit: "Count" },
});

describe("metrics", () => {
  it("ships an empty catalog", () => {
    expect(METRICS).toEqual({});
  });

  it("declares a metric's unit and dimension values", () => {
    expect(sample["message.failed"]).toEqual({
      dimensions: { stage: ["validate", "store"] },
      unit: "Count",
    });
  });

  it("emits a declared metric with a declared dimension value", () => {
    const metrics = recordingMetrics<typeof sample>();
    metrics.emit("message.failed", 1, { stage: "store" });
    expect(metrics.emitted).toEqual([
      { dimensions: { stage: "store" }, name: "message.failed", value: 1 },
    ]);
  });

  it("rejects an id as a dimension value, at compile time", () => {
    const metrics = recordingMetrics<typeof sample>();
    // @ts-expect-error -- dimension values are a fixed list; a unit id is not one of them.
    metrics.emit("message.failed", 1, { stage: "0190c5e2-unit-id" });
    // @ts-expect-error -- only catalogued metrics can be emitted.
    metrics.emit("message.unknown", 1, { stage: "store" });
    expect(metrics.emitted).toHaveLength(2);
  });
});
