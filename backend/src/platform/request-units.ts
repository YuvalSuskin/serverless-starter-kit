// What DynamoDB bills, in request units, for items of a given size. A store
// that meters its cost to a unit uses these, since its items can grow. An item
// serialized as JSON is a close stand-in for DynamoDB's own count (attribute
// names and values in UTF-8).

const encoder = new TextEncoder();

/** An item's size in bytes, as JSON. */
export const itemBytes = (item: unknown): number => encoder.encode(JSON.stringify(item)).length;

/** Standard writes or deletes: one unit per started KB of each item, at least one. */
export function writeUnits(items: readonly unknown[]): number {
  return items.reduce<number>(
    (sum, item) => sum + Math.max(1, Math.ceil(itemBytes(item) / 1024)),
    0,
  );
}

/**
 * A strongly consistent read, of one item or one Query page: one unit per
 * started 4 KB of everything it read, at least one even when it found nothing.
 */
export function readUnits(items: readonly unknown[]): number {
  const bytes = items.reduce<number>((sum, item) => sum + itemBytes(item), 0);
  return Math.max(1, Math.ceil(bytes / 4096));
}
