import { expect, it } from "vitest";

import { beadIdPattern, beadPrefix } from "./prefix.ts";
import { tempRepo } from "./testing.ts";

it("falls back to acme when the repo holds no beads config", () => {
  expect(beadPrefix(tempRepo({ "README.md": "x" }))).toBe("acme");
});

it("reads issue-prefix from .beads/config.yaml, ignoring a commented line", () => {
  const commented = tempRepo({
    ".beads/config.yaml": '# issue-prefix: "nope"\n',
    ".beads/metadata.json": '{ "dolt_database": "fromdb" }',
  });
  expect(beadPrefix(commented)).toBe("fromdb");
  const set = tempRepo({
    ".beads/config.yaml": '# issue-prefix: "nope"\nissue-prefix: "shop"\n',
    ".beads/metadata.json": '{ "dolt_database": "fromdb" }',
  });
  expect(beadPrefix(set)).toBe("shop");
});

it("reads the database name from .beads/metadata.json when config.yaml names no prefix", () => {
  const root = tempRepo({ ".beads/metadata.json": '{ "dolt_database": "shop" }' });
  expect(beadPrefix(root)).toBe("shop");
});

it("falls back when the metadata is unreadable or the name is not a plain word", () => {
  expect(beadPrefix(tempRepo({ ".beads/metadata.json": "{ not json" }))).toBe("acme");
  expect(beadPrefix(tempRepo({ ".beads/metadata.json": '{ "dolt_database": "a b" }' }))).toBe(
    "acme",
  );
});

it("matches IDs of its own prefix only, with child numbers", () => {
  const pattern = beadIdPattern("shop");
  const found = [..."shop-ab1 shop-ab1.2 acme-ab1 Shop-ab1".matchAll(pattern)].map((m) => m[0]);
  expect(found).toEqual(["shop-ab1", "shop-ab1.2"]);
});

it("accepts a hyphenated prefix, from the config or the database name", () => {
  const fromConfig = tempRepo({ ".beads/config.yaml": 'issue-prefix: "my-shop"\n' });
  expect(beadPrefix(fromConfig)).toBe("my-shop");
  const fromDb = tempRepo({ ".beads/metadata.json": '{ "dolt_database": "my-shop" }' });
  expect(beadPrefix(fromDb)).toBe("my-shop");
});

it("matches a hyphenated prefix whole, and escapes the prefix as plain text", () => {
  const found = [
    ..."my-shop-ab1 my-shop-ab1.2 my-ab1 xmy-shop-ab1".matchAll(beadIdPattern("my-shop")),
  ];
  expect(found.map((m) => m[0])).toEqual(["my-shop-ab1", "my-shop-ab1.2"]);
  expect(beadIdPattern("a.b").test("axb-ab1")).toBe(false);
});
