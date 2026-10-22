import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { Batch, Card } from "./cards.ts";

import { buildPage } from "./build.ts";
import { sampleCard } from "./testing.ts";

function batchOf(cards: Card[]): Batch {
  return { batch: 1, round: 1, title: "Review batch 1", cards };
}

// The JSON the page reads its data from.
function embeddedData(page: string): unknown {
  const match = /<script type="application\/json" id="batch-data">([\s\S]*?)<\/script>/.exec(page);
  if (!match?.[1]) throw new Error("no data block");
  return JSON.parse(match[1]);
}

describe("buildPage", () => {
  it("shows every card's title and bead id", () => {
    const page = buildPage(
      batchOf([
        sampleCard({ id: "acme-a1", title: "Spec: sign-in" }),
        sampleCard({ id: "acme-b2", title: "Recommendation: DNS" }),
      ]),
    );
    for (const text of ["Spec: sign-in", "acme-a1", "Recommendation: DNS", "acme-b2"]) {
      expect(page).toContain(text);
    }
  });

  it("keeps markup in a draft or a pitch as text", () => {
    const card = sampleCard({
      id: "acme-x",
      draft: "Before </script><script>alert(1)</script> after",
    });
    const hostile = { ...card, pitch: { ...card.pitch, what: '<img src=x onerror="alert(1)">' } };
    const page = buildPage(batchOf([hostile]));
    expect(page).not.toContain("<img src=x");
    expect(page).not.toContain("<script>alert(1)");
    expect(embeddedData(page)).toMatchObject({ cards: [{ id: "acme-x", round: 1 }] });
  });

  it("renders a draft's Markdown, without script links", () => {
    const page = buildPage(
      batchOf([
        sampleCard({
          draft: "## Rules\n\n**FIND-R1.** Visitors see [the list](javascript:alert(1)).",
        }),
      ]),
    );
    expect(page).toContain("<h2>Rules</h2>");
    expect(page).toContain("<strong>FIND-R1.</strong>");
    expect(page).not.toContain("javascript:");
  });

  it("orders the cards by how much work each unblocks", () => {
    const page = buildPage(
      batchOf([
        sampleCard({ id: "acme-few", title: "Few", unblocks: ["one"] }),
        sampleCard({ id: "acme-many", title: "Many", unblocks: ["one", "two", "three"] }),
      ]),
    );
    expect(page.indexOf('data-key="acme-many--r1"')).toBeLessThan(
      page.indexOf('data-key="acme-few--r1"'),
    );
  });

  it("lets every pitch block and the draft pick their own direction", () => {
    const page = buildPage(batchOf([sampleCard({ draft: "يرى الضيوف المعرض." })]));
    const pitchBlocks = page.match(/<(p|li) class="pitch-[a-z]+"[^>]*>/g) ?? [];
    expect(pitchBlocks.length).toBeGreaterThan(0);
    for (const block of pitchBlocks) expect(block).toContain('dir="auto"');
    expect(page).toMatch(/\.draft :is\([^)]*\)\s*\{[^}]*unicode-bidi: plaintext/);
  });

  it("shows a sweep card as a contradiction, and its journey as how it came about", () => {
    const html = buildPage(batchOf([sampleCard({ kind: "sweep" })]));
    expect(html).toContain(">Contradiction</span>");
    expect(html).toContain("<h3>How it came about</h3>");
  });

  it("marks a blocked card with what it is missing", () => {
    const page = buildPage(batchOf([sampleCard({ blocked: "Needs the event spec first" })]));
    expect(page).toContain("Needs the event spec first");
  });

  it("loads nothing from outside: the system's own fonts, no script or stylesheet", () => {
    const page = buildPage(batchOf([sampleCard()]));
    expect(page).not.toMatch(/<script[^>]+src=/);
    expect(page).not.toMatch(/<link\b/);
    expect(page).not.toMatch(/https?:\/\/fonts\./);
  });

  it("keeps the page's logic in its script when a card quotes a marker", () => {
    const card = sampleCard({ draft: 'Markers: {{CARDS}} "__BATCH_DATA__" /* __PAGE_LOGIC__ */' });
    const quoting = {
      ...card,
      pitch: { ...card.pitch, what: "/* __PAGE_LOGIC__ */ and {{HEADING}}" },
    };
    const page = buildPage(batchOf([quoting]));
    const script = page.slice(page.indexOf('<script type="module">'));
    expect(script).toContain("function canSubmit(");
    expect(page.indexOf("function canSubmit(")).toBeGreaterThan(
      page.indexOf('<script type="module">'),
    );
    expect(embeddedData(page)).toMatchObject({ cards: [{ id: "acme-abc" }] });
  });

  it("shows a draft's images as links, never loading them", () => {
    const page = buildPage(
      batchOf([sampleCard({ draft: "![the cover](https://example.com/cover.png)" })]),
    );
    expect(page).not.toContain("<img");
  });

  it("inlines the page's logic", () => {
    const page = buildPage(batchOf([sampleCard()]));
    expect(page).toContain("function canSubmit(");
    expect(page).not.toContain("import type");
  });
});

describe("pnpm review-batch build", () => {
  const cli = join(import.meta.dirname, "cli.ts");

  it("refuses an invalid batch, naming the field", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-batch-"));
    const file = join(dir, "cards.json");
    writeFileSync(file, JSON.stringify({ batch: 1, round: 1, title: "B", cards: [{ id: "x" }] }));
    const run = spawnSync(process.execPath, [cli, "build", file, "--out", join(dir, "page.html")], {
      encoding: "utf8",
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("cards.0.title");
  });

  it("writes the page for a valid batch", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-batch-"));
    const file = join(dir, "cards.json");
    const out = join(dir, "page.html");
    writeFileSync(file, JSON.stringify(batchOf([sampleCard()])));
    const run = spawnSync(process.execPath, [cli, "build", file, "--out", out], {
      encoding: "utf8",
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(out);
  });
});
