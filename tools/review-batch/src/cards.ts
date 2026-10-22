// A review batch and its cards: what the lead writes to cards.json and the page
// renders.
import * as z from "zod";

const Text = z.string().trim().min(1);

const CallSchema = z.object({ question: Text, recommendation: Text });

const PitchSchema = z.object({
  what: Text,
  who: Text,
  journey: z.array(Text).min(1).max(5),
  included: z.array(Text),
  left: z.array(Text),
  competitors: z.array(Text),
  calls: z.array(CallSchema),
});

const CardSchema = z
  .object({
    // The id is part of a store path (answers/<id>--r<round>) and of the markup.
    id: z.string().regex(/^[A-Za-z0-9._~:@+-]+$/, "Only letters, digits and . _ ~ : @ + -"),
    round: z.number().int().min(1),
    title: Text,
    kind: z.enum(["spec", "decision", "docs", "findings", "sweep"]),
    unblocks: z.array(Text),
    pitch: PitchSchema,
    draft: z.string(),
    blocked: Text.optional(),
  })
  // A findings card lists every finding as a call; every other card asks at
  // most three questions.
  .refine((card) => card.kind === "findings" || card.pitch.calls.length <= 3, {
    message: "A card other than findings asks at most three calls",
    path: ["pitch", "calls"],
  })
  // A sweep card's first call is the winner: which side is right (sweep spec §6).
  .refine((card) => card.kind !== "sweep" || card.pitch.calls.length > 0, {
    message: "A sweep card's first call names the winning side",
    path: ["pitch", "calls"],
  })
  .refine((card) => card.blocked !== undefined || card.draft.trim() !== "", {
    message: "A card that is not blocked needs its draft",
    path: ["draft"],
  });

export const BatchSchema = z
  .object({
    batch: z.number().int().min(1),
    round: z.number().int().min(1),
    title: Text,
    cards: z.array(CardSchema),
  })
  .superRefine((batch, ctx) => {
    const seen = new Set<string>();
    batch.cards.forEach((card, index) => {
      // Answers are stored per bead and round (state.ts answerKey): two such
      // cards would share one answer.
      const key = `${card.id}--r${String(card.round)}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `Two cards for ${key}`,
          path: ["cards", index, "id"],
        });
      }
      seen.add(key);
      if (card.round > batch.round) {
        ctx.addIssue({
          code: "custom",
          message: `Card round ${String(card.round)} is after the batch's round ${String(batch.round)}`,
          path: ["cards", index, "round"],
        });
      }
    });
  });

export type Card = z.infer<typeof CardSchema>;
export type Batch = z.infer<typeof BatchSchema>;
