// The shape of every file under docs/competitors/, plus
// decisions C3 (review flags) and C4 (superseded.by may be null).
import * as z from "zod";

export const SOURCES = ["google", "pasted"] as const;
export const RAW_FILES = [...SOURCES, "site"] as const;
const isoDate = z.iso.date();
const webUrl = z.url({ protocol: /^https?$/ });
const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be a kebab-case ID");

/** What a collector knows about a review; tier 1 adds id, source, fetched and gone. */
export const REVIEW_FIELDS = {
  url: webUrl.nullable(),
  posted: isoDate.nullable(),
  rating: z.number().min(0).nullable(),
  rating_scale: z.number().int().positive().nullable(),
  text: z.string(),
  flags: z.array(kebab).optional(),
  origin: z.string().min(1).optional(),
  context: z.string().optional(),
};

export const ReviewRecord = z
  .strictObject({
    id: z.string().min(1),
    source: z.enum(SOURCES),
    ...REVIEW_FIELDS,
    fetched: isoDate,
    gone: isoDate.nullable(),
  })
  .superRefine((review, ctx) => {
    if (
      review.rating !== null &&
      (review.rating_scale === null || review.rating > review.rating_scale)
    ) {
      ctx.addIssue({ code: "custom", message: "must be within rating_scale", path: ["rating"] });
    }
    if (review.source === "pasted" && review.origin === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "is required for pasted material",
        path: ["origin"],
      });
    }
    for (const field of ["origin", "context"] as const) {
      if (review.source !== "pasted" && review[field] !== undefined) {
        ctx.addIssue({ code: "custom", message: "belongs only to pasted material", path: [field] });
      }
    }
  });
export type ReviewRecord = z.infer<typeof ReviewRecord>;

export const ClaimRecord = z.strictObject({
  id: z.string().min(1),
  url: webUrl,
  kind: z.enum(["feature", "price", "persona", "promise", "testimonial"]),
  text: z.string().min(1),
  fetched: isoDate,
  superseded: z.strictObject({ date: isoDate, by: z.string().nullable() }).nullable(),
});
export type ClaimRecord = z.infer<typeof ClaimRecord>;

export const InsightEntry = z.strictObject({
  ref: z.string().min(1),
  persona: kebab.nullable(),
  summary_en: z.string().min(1),
  mentions: z.array(
    z.strictObject({
      feature: kebab,
      sentiment: z.enum(["positive", "negative", "mixed", "neutral"]),
      kind: z.enum(["praise", "pain", "missing", "claim"]),
    }),
  ),
  tagged: isoDate,
});
export type InsightEntry = z.infer<typeof InsightEntry>;

// A listing that is null was confirmed absent; a missing key is not yet identified.
export const Meta = z.strictObject({
  name: z.string().min(1),
  slug: kebab,
  aliases: z.array(z.string()),
  domains: z.array(z.string()),
  confirmed: isoDate,
  listings: z.strictObject({
    google: z
      .strictObject({
        data_id: z.string().min(1),
        place_id: z.string().nullable(),
        url: webUrl.nullable(),
      })
      .nullable()
      .optional(),
    site: z.array(webUrl).optional(),
  }),
});
export type Meta = z.infer<typeof Meta>;

const Withdrawn = z.strictObject({
  date: isoDate,
  reason: z.string().min(1),
  replaced_by: kebab.nullable(),
});

export const Feature = z
  .strictObject({
    id: kebab,
    name: z.string().min(1),
    type: z.enum(["feature", "aspect"]),
    // A step of the product's own lifecycle; `aspect` is the stage of aspects.
    stage: kebab,
    glossary: kebab.nullable(),
    aliases: z.array(z.string()),
    withdrawn: Withdrawn.nullish(),
  })
  .refine((feature) => (feature.type === "aspect") === (feature.stage === "aspect"), {
    message: "an aspect, and only an aspect, has stage aspect",
    path: ["stage"],
  });
export type Feature = z.infer<typeof Feature>;

export const Persona = z.strictObject({
  id: kebab,
  name: z.string().min(1),
  actor: kebab.nullable(),
  aliases: z.array(z.string()),
  withdrawn: Withdrawn.nullish(),
});
export type Persona = z.infer<typeof Persona>;
