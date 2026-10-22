import { Marked, type Tokens } from "marked";
// Build a batch's review page: cards rendered to HTML here, the page's logic
// (state.ts) inlined, and the answers left to the page's store at view time.
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";

import type { Batch, Card } from "./cards.ts";

import { answerKey, sortCards } from "./state.ts";

const KIND_LABEL: Record<Card["kind"], string> = {
  spec: "Spec",
  decision: "Decision",
  docs: "Docs",
  findings: "Findings",
  sweep: "Contradiction",
};

const JOURNEY_HEADING: Partial<Record<Card["kind"], string>> = {
  decision: "The options",
  sweep: "How it came about",
};

const CHOICES = [
  ["approve", "Approve"],
  ["approve-note", "Approve with a note"],
  ["reject", "Reject with a note"],
  ["later", "Later"],
] as const;

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Drafts are Markdown written by agents: raw HTML in them is shown as text,
// and only web and in-page links become links.
const markdown = new Marked({
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(token.text);
    },
    image(token: Tokens.Image) {
      // The page loads nothing from outside: an image becomes a link to it.
      const label = escapeHtml(token.text || "image");
      if (!/^https?:/i.test(token.href)) return label;
      return `<a href="${escapeHtml(token.href)}" rel="noreferrer" target="_blank">${label}</a>`;
    },
    link(token: Tokens.Link) {
      const text = this.parser.parseInline(token.tokens);
      if (!/^(https?:|#)/i.test(token.href)) return text;
      return `<a href="${escapeHtml(token.href)}" rel="noreferrer" target="_blank">${text}</a>`;
    },
  },
});

function items(className: string, values: readonly string[]): string {
  return values
    .map((value) => `<li class="${className}" dir="auto">${escapeHtml(value)}</li>`)
    .join("");
}

function listOrNone(className: string, values: readonly string[]): string {
  return values.length > 0 ? `<ul>${items(className, values)}</ul>` : `<p class="rec">None</p>`;
}

function renderCalls(card: Card): string {
  if (card.pitch.calls.length === 0)
    return `<p class="rec">None: nothing here needs your decision.</p>`;
  const calls = card.pitch.calls
    .map(
      (call, index) => `<li class="pitch-call call" dir="auto">
        <p>${escapeHtml(call.question)}</p>
        <p class="rec">Recommended: <b>${escapeHtml(call.recommendation)}</b></p>
        <label class="override">Your answer, only if different
          <input type="text" data-call-input="${String(index)}" dir="auto" autocomplete="off">
        </label>
      </li>`,
    )
    .join("");
  return `<ol class="calls">${calls}</ol>`;
}

function renderCard(card: Card): string {
  const key = answerKey(card);
  const { pitch } = card;
  const unblocks =
    card.unblocks.length > 0
      ? `Unblocks ${escapeHtml(card.unblocks.join(", "))}`
      : "Unblocks nothing directly";
  const choices = CHOICES.map(
    ([value, label]) =>
      `<label><input type="radio" name="choice-${key}" value="${value}"> ${label}</label>`,
  ).join("");
  return `<details class="card" data-key="${key}" data-kind="${card.kind}">
  <summary class="card-head">
    <span class="kind">${KIND_LABEL[card.kind]}</span>
    <span class="title" dir="auto">${escapeHtml(card.title)}</span>
    <span class="state"></span>
    <span class="unblocks">${unblocks}</span>
  </summary>
  <div class="card-body">
    <p class="bead">${escapeHtml(card.id)} · round ${String(card.round)}</p>
    ${card.blocked === undefined ? "" : `<p class="blocked" dir="auto">Blocked: ${escapeHtml(card.blocked)}</p>`}
    <section class="pitch">
      <h3>What it is</h3><p class="pitch-what" dir="auto">${escapeHtml(pitch.what)}</p>
      <h3>Who uses it, and when</h3><p class="pitch-who" dir="auto">${escapeHtml(pitch.who)}</p>
      <h3>${JOURNEY_HEADING[card.kind] ?? "The journey"}</h3><ol>${items("pitch-step", pitch.journey)}</ol>
      <h3>In, and left out</h3>
      <div class="inout">
        <div><h4>In</h4>${listOrNone("pitch-in", pitch.included)}</div>
        <div><h4>Left out</h4>${listOrNone("pitch-out", pitch.left)}</div>
      </div>
      <h3>What competitors do</h3>${listOrNone("pitch-comp", pitch.competitors)}
      <h3>Your calls</h3>${renderCalls(card)}
    </section>
    ${card.draft.trim() === "" ? "" : `<details class="full"><summary>Full draft</summary><div class="draft">${markdown.parse(card.draft, { async: false })}</div></details>`}
    <fieldset class="answer">
      <legend>Your answer</legend>
      <div class="choices">${choices}</div>
      <label class="override">Note<textarea data-note dir="auto"></textarea></label>
      <p class="need-note" hidden>Add a note to send this answer.</p>
    </fieldset>
  </div>
</details>`;
}

// JSON inside a <script> element must never contain "<", or a "</script>" in
// the data would end the element early.
function embed(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(" ", "\\u2028")
    .replaceAll(" ", "\\u2029");
}

function pageLogic(): string {
  const source = readFileSync(join(import.meta.dirname, "state.ts"), "utf8");
  return stripTypeScriptTypes(source);
}

export function buildPage(batch: Batch): string {
  const template = readFileSync(join(import.meta.dirname, "page.html"), "utf8");
  const cards = sortCards(batch.cards);
  const data = {
    batch: batch.batch,
    round: batch.round,
    cards: cards.map(({ id, round }) => ({ id, round })),
  };
  const heading = batch.round > 1 ? `${batch.title}, round ${String(batch.round)}` : batch.title;
  const fill: Record<string, () => string> = {
    "{{TITLE}}": () => escapeHtml(batch.title),
    "{{HEADING}}": () => escapeHtml(heading),
    "{{CARDS}}": () => cards.map(renderCard).join("\n"),
    '"__BATCH_DATA__"': () => embed(data),
    "/* __PAGE_LOGIC__ */": () => pageLogic(),
  };
  // One pass: text inserted for one marker is never searched for another, so a
  // card that quotes a marker cannot pull the page's logic into itself.
  return template.replace(
    /\{\{(?:TITLE|HEADING|CARDS)\}\}|"__BATCH_DATA__"|\/\* __PAGE_LOGIC__ \*\//g,
    (marker) => (fill[marker] ?? (() => marker))(),
  );
}
