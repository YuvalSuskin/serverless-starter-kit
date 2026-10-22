// A backstop, not the main defence: request and response bodies are never
// logged at all. If a field whose name carries one of these words
// reaches a log line anyway, its value is replaced. Keys are split into words
// (camelCase, snake_case, kebab-case), so `visitorEmail` and `display_name` are
// caught while `code`, `hostname` and `surface` are not.
export const REDACTED_WORDS = [
  "address",
  "email",
  "gps",
  "lat",
  "latitude",
  "lng",
  "location",
  "longitude",
  "name",
  "phone",
] as const;

const redactedWords = new Set<string>(REDACTED_WORDS);

const wordsOf = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

function isPersonal(key: string): boolean {
  const words = wordsOf(key);
  // Pairs too: two words that together name personal data, though neither alone does.
  const pairs = words.slice(1).map((word, index) => `${words[index] ?? ""}${word}`);
  return [...words, ...pairs].some((word) => redactedWords.has(word));
}

const redactFields = (value: object) =>
  Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      isPersonal(key) ? "[redacted]" : redact(inner),
    ]),
  );

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Date) return value.toISOString();
  // An Error's name, message and stack are not enumerable: without this, a
  // logged error is {} and the failure vanishes from the logs. Its own
  // enumerable fields (a code, details) are redacted like any others.
  if (value instanceof Error) {
    return { ...redactFields(value), message: value.message, name: value.name, stack: value.stack };
  }
  if (value === null || typeof value !== "object") return value;
  return redactFields(value);
}
