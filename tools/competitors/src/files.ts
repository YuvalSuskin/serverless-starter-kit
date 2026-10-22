// Where the data lives, and reading and writing its YAML lists. Text must
// survive a round trip byte for byte: it is evidence.

import type { z } from "zod";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Document, isScalar, parse, visit } from "yaml";

// The key order every written record follows; keys not listed come last.
const KEY_ORDER = [
  "id",
  "ref",
  "source",
  "url",
  "posted",
  "rating",
  "rating_scale",
  "persona",
  "summary_en",
  "mentions",
  "feature",
  "sentiment",
  "kind",
  "text",
  "flags",
  "origin",
  "context",
  "fetched",
  "gone",
  "superseded",
  "date",
  "by",
  "tagged",
];

export const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

export function competitorsDir(root: string): string {
  return path.join(root, "docs", "competitors");
}

/** Parses a YAML file; undefined when the file does not exist. Throws on bad YAML. */
export function loadYaml(file: string): unknown {
  if (!existsSync(file)) return undefined;
  return parse(readFileSync(file, "utf8"), { version: "1.2" }) as unknown;
}

/** A YAML list validated against `schema`; [] when the file does not exist. */
export function readYamlList<T>(file: string, schema: z.ZodType<T>): T[] {
  const data = loadYaml(file) ?? [];
  if (!Array.isArray(data)) throw new Error(`${file}: must be a list`);
  return data.map((item: unknown, index) => {
    const parsed = schema.safeParse(item);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) =>
        [issue.path.join("."), issue.message].join(" "),
      );
      throw new Error(`${file}: item ${String(index + 1)}: ${issues.join("; ")}`);
    }
    return parsed.data;
  });
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value === null || typeof value !== "object") return value;
  const rank = (key: string) =>
    KEY_ORDER.includes(key) ? KEY_ORDER.indexOf(key) : KEY_ORDER.length;
  const entries = Object.entries(value).sort(([a], [b]) => rank(a) - rank(b));
  return Object.fromEntries(entries.map(([key, inner]) => [key, ordered(inner)]));
}

/**
 * YAML for a list of records: one block map per record, anything nested on one
 * line. Written text must read back identical; when yaml's block scalars
 * cannot hold a text exactly (whitespace-only lines), strings are
 * double-quoted instead, and if even that fails nothing is written.
 */
function render(items: unknown[], blockQuote: boolean): string {
  const doc = new Document(ordered(items), { version: "1.2" });
  visit(doc, {
    Map: (_key, node, ancestors) => {
      if (ancestors.length > 2) node.flow = true;
    },
    Seq: (_key, node, ancestors) => {
      if (ancestors.length > 2 && node.items.every((item) => isScalar(item))) node.flow = true;
    },
  });
  return doc.toString({ blockQuote, lineWidth: 0 });
}

export function writeYamlList(file: string, items: unknown[]): void {
  const expected = JSON.stringify(ordered(items));
  const body =
    items.length === 0
      ? "[]\n"
      : [true, false]
          .map((blockQuote) => render(items, blockQuote))
          .find((text) => {
            try {
              return JSON.stringify(parse(text, { version: "1.2" })) === expected;
            } catch {
              return false;
            }
          });
  if (body === undefined)
    throw new Error(`${file}: YAML cannot hold these records exactly; nothing written`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
}
