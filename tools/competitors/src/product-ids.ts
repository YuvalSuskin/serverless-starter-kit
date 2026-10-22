// The IDs other docs may link to: glossary terms and actors, read from the
// first table in docs/product/shared/glossary.md and actors.md. A row whose
// cells outside the ID are struck through (~~) is withdrawn.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** The current IDs in a file's first table. Errors say what is wrong, not where. */
export function readIdTable(file: string): Set<string> {
  if (!existsSync(file)) throw new Error("is missing");
  const rows = readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim());
  const start = rows.findIndex((line) => line.startsWith("|"));
  const cells = (line: string) =>
    line
      .slice(1, line.endsWith("|") ? line.length - 1 : line.length)
      .split("|")
      .map((cell) => cell.trim());
  if (start === -1 || cells(rows[start] ?? "")[0] !== "ID") {
    throw new Error("the first table must have an ID column first");
  }
  const ids = new Set<string>();
  for (const line of rows.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    const [id, ...rest] = cells(line);
    const match = /^`([a-z0-9]+(?:-[a-z0-9]+)*)`$/.exec(id ?? "");
    if (!match?.[1]) throw new Error(`"${id ?? ""}" is not a backticked kebab-case ID`);
    if (!rest.some((cell) => cell.includes("~~"))) ids.add(match[1]);
  }
  return ids;
}

export const PRODUCT_ID_FILES = {
  actors: path.join("docs", "product", "shared", "actors.md"),
  glossary: path.join("docs", "product", "shared", "glossary.md"),
};

export function readProductIds(root: string): { actors: Set<string>; glossary: Set<string> } {
  const read = (file: string) => {
    try {
      return readIdTable(path.join(root, file));
    } catch (error) {
      throw new Error(`${file}: ${(error as Error).message}`, { cause: error });
    }
  };
  return { actors: read(PRODUCT_ID_FILES.actors), glossary: read(PRODUCT_ID_FILES.glossary) };
}
