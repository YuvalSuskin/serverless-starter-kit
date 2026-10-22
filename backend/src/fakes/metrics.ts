import type { MetricCatalog, Metrics } from "../platform/metrics";

export interface RecordingMetrics<Catalog extends MetricCatalog> extends Metrics<Catalog> {
  readonly emitted: { dimensions: Record<string, string>; name: string; value: number }[];
}

export function recordingMetrics<Catalog extends MetricCatalog>(): RecordingMetrics<Catalog> {
  const emitted: RecordingMetrics<Catalog>["emitted"] = [];
  return {
    emit: (name, value, dimensions) => {
      emitted.push({ dimensions: dimensions, name, value });
    },
    emitted,
  };
}
