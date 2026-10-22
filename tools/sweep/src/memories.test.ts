// The seed memories: three owner preferences, generalised, that the
// bootstrap fills and imports with `bd remember --key <key> "<text>"`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as z from "zod";

import { SEEDS } from "./recall.ts";

const REPO = path.join(import.meta.dirname, "../../..");
const Memories = z.array(z.strictObject({ key: z.string().min(1), text: z.string().min(1) }));
const memories = Memories.parse(
  JSON.parse(readFileSync(path.join(REPO, ".beads/seed-memories.json"), "utf8")),
);
const byKey = new Map(memories.map((m) => [m.key, m.text]));

// The bootstrap's answers; each placeholder here is filled by one of its steps.
const PLACEHOLDERS = new Set([
  "<dev-stage-name>",
  "<owner-inbox-url>",
  "<platform-resources>",
  "<project-account>",
  "<registrar-exception>",
]);

describe(".beads/seed-memories.json", () => {
  it("holds the three generalised memories, each key once", () => {
    expect(memories.map((m) => m.key).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "explain-before-infra",
      "owner-inbox",
      "project-accounts-only",
    ]);
  });

  it("names no first project and holds no Hebrew", () => {
    const named = memories.filter(({ text }) => /kalivent|\p{Script=Hebrew}/iu.test(text));
    expect(named.map((m) => m.key)).toEqual([]);
  });

  it("leaves only placeholders the bootstrap fills", () => {
    const unknown = memories.flatMap(({ key, text }) =>
      (text.match(/<[a-z-]+>/g) ?? [])
        .filter((placeholder) => !PLACEHOLDERS.has(placeholder))
        .map((placeholder) => `${key}: ${placeholder}`),
    );
    expect(unknown).toEqual([]);
    // Which file holds each placeholder until its step fills it, and none
    // after: .claude/skills/bootstrap/fills.json, checked by
    // tools/bootstrap/src/fills.test.ts.
  });

  it("keeps the text the sweep's memory recall seed plants against", () => {
    const seed = SEEDS.find((s) => s.id === "memory");
    const key = /^snapshot\/memories\/(.+)\.md$/.exec(seed?.file ?? "")?.[1];
    expect(key).toBe("explain-before-infra");
    expect(byKey.get(key ?? "")).toContain(seed?.find);
  });
});
