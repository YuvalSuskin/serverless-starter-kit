// Custom metrics, for what AWS cannot see. Every metric is
// declared in the catalog first, and every dimension is a fixed list of
// values: an id can never be a dimension, because each distinct value is
// billed as a separate metric.
interface MetricDefinition {
  dimensions: Readonly<Record<string, readonly string[]>>;
  unit: "Bytes" | "Count" | "Milliseconds";
}

export type MetricCatalog = Readonly<Record<string, MetricDefinition>>;

type DimensionsOf<Definition extends MetricDefinition> = {
  [Name in keyof Definition["dimensions"]]: Definition["dimensions"][Name][number];
};

export interface Metrics<Catalog extends MetricCatalog = typeof METRICS> {
  emit<Name extends keyof Catalog & string>(
    name: Name,
    value: number,
    dimensions: DimensionsOf<Catalog[Name]>,
  ): void;
}

export const defineMetricCatalog = <const Catalog extends MetricCatalog>(catalog: Catalog) =>
  catalog;

// Empty on purpose: which metrics to track is an open decision.
export const METRICS = defineMetricCatalog({});
