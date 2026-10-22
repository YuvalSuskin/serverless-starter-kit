// Quotes are compared as text, not as bytes: a paragraph re-wrapped by the
// formatter, or Hebrew stored composed or decomposed, is the same quote
// (plan Review Focus 2).

export function normaliseQuote(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function containsQuote(text: string, quote: string): boolean {
  const needle = normaliseQuote(quote);
  return needle !== "" && normaliseQuote(text).includes(needle);
}
