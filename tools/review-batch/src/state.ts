// The review page's decisions, as pure functions. build.ts inlines this file
// into the page, so it imports nothing at run time (types only).
import type { Card } from "./cards.ts";

export interface Answer {
  choice: "approve" | "approve-note" | "reject" | "later";
  note?: string;
  // Call index -> the owner's answer, only where it differs from the recommendation.
  calls: Record<number, string>;
}

export type Answers = Record<string, Answer | undefined>;

// A card's answer lives under its bead and round, so a redrafted card starts
// unanswered while the earlier round's answer stays in the store.
export function answerKey(card: Pick<Card, "id" | "round">): string {
  return `${card.id}--r${String(card.round)}`;
}

function isComplete(answer: Answer | undefined): boolean {
  if (answer === undefined) return false;
  const needsNote = answer.choice === "approve-note" || answer.choice === "reject";
  // The note may be missing from a document in the store; treat it as empty.
  return !needsNote || (answer.note ?? "").trim() !== "";
}

export function progress(
  cards: readonly Card[],
  answers: Answers,
): { answered: number; total: number } {
  const answered = cards.filter((card) => isComplete(answers[answerKey(card)])).length;
  return { answered, total: cards.length };
}

export function canSubmit(cards: readonly Card[], answers: Answers): boolean {
  return cards.length > 0 && cards.every((card) => isComplete(answers[answerKey(card)]));
}

// Blocked cards last; the rest by how much work each unblocks, then by title.
export function sortCards(cards: readonly Card[]): Card[] {
  return [...cards].sort(
    (a, b) =>
      Number(a.blocked !== undefined) - Number(b.blocked !== undefined) ||
      b.unblocks.length - a.unblocks.length ||
      a.title.localeCompare(b.title),
  );
}

// Complete answers alone are not enough: every change must also be saved, or
// the batch could be submitted with what the store holds, not what is shown.
export function readyToSubmit(cards: readonly Card[], answers: Answers, unsaved: number): boolean {
  return unsaved === 0 && canSubmit(cards, answers);
}

// The store's answers, except where the owner has changes not yet saved.
export function mergeStored(
  local: Answers,
  stored: Answers,
  unsaved: ReadonlySet<string>,
): Answers {
  const merged: Answers = { ...stored };
  for (const key of unsaved) merged[key] = local[key];
  return merged;
}

export interface StoredState {
  status?: string;
  round?: number;
}

// "stale": a tab left open from an earlier round, after the lead published the
// next one. It must not submit, or it would overwrite the newer round's state.
export function pageStatus(
  state: StoredState | undefined,
  round: number,
): "open" | "submitted" | "applied" | "stale" {
  const storedRound = state?.round ?? 0;
  if (storedRound > round) return "stale";
  if (storedRound < round) return "open";
  return state?.status === "submitted" || state?.status === "applied" ? state.status : "open";
}
