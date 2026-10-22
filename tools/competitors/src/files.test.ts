import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as z from "zod";

import { readYamlList, writeYamlList } from "./files.ts";

const Item = z.object({ id: z.string(), text: z.string() });
const tmp = () => mkdtempSync(path.join(tmpdir(), "competitors-files-"));

describe("YAML lists", () => {
  it("reads a missing file as an empty list", () => {
    expect(readYamlList(path.join(tmp(), "none.yaml"), Item)).toEqual([]);
  });

  it.each([
    ["Greek with quotes and a colon", 'Η υπηρεσία ήταν "εξαιρετική": τη συστήνω, ευχαριστώ\'.'],
    ["a leading dash", "- δεν ήταν καλό"],
    ["a leading hash", "# τίτλος"],
    ["emoji", "τέλειο 😍🎉"],
    ["bidirectional marks", "\u200Fمرحبا\u200E Examplo\u200F"],
    ["blank lines inside", "πρώτη γραμμή\n\nτρίτη γραμμή\n"],
    ["no final newline", "γραμμή\nτελευταία γραμμή"],
    ["trailing spaces", "κείμενο   \nάλλο  "],
    ["empty text", ""],
    ["a very long line", "λέξη ".repeat(80).trim()],
    ["a space then a newline", " \n"],
    ["spaces then blank lines", "  \n\n"],
    ["a line holding only a space", "\n \n"],
    ["a space and a tab", " \t\n"],
    ["a more-indented blank line", " \n\t\n"],
  ])("keeps %s byte for byte", (_name, text) => {
    const file = path.join(tmp(), "list.yaml");
    writeYamlList(file, [{ id: "a", text }]);
    expect(readYamlList(file, Item)).toEqual([{ id: "a", text }]);
  });

  it("writes keys in the canonical order, whatever order the object has", () => {
    const file = path.join(tmp(), "list.yaml");
    writeYamlList(file, [
      { gone: null, text: "t", id: "a", fetched: "2026-09-29", source: "google" },
    ]);
    const keys = readFileSync(file, "utf8")
      .split("\n")
      .map((line) => /^[- ] ?(\w+):/.exec(line)?.[1])
      .filter(Boolean);
    expect(keys).toEqual(["id", "source", "text", "fetched", "gone"]);
  });

  it("writes insight mentions and nested values on one line, feature first", () => {
    const file = path.join(tmp(), "list.yaml");
    writeYamlList(file, [
      { mentions: [{ kind: "pain", sentiment: "negative", feature: "price" }], ref: "a" },
    ]);
    expect(readFileSync(file, "utf8")).toContain(
      "- { feature: price, sentiment: negative, kind: pain }",
    );
  });

  it("throws, naming the file, when an item does not match the schema", () => {
    const file = path.join(tmp(), "list.yaml");
    writeYamlList(file, [{ id: 1 }]);
    expect(() => readYamlList(file, Item)).toThrow(/list\.yaml/);
  });
});
