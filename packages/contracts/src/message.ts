// Skeleton: the template's demo message, replaced by bootstrap step 6.
// A contact message: a visitor writes one, the owner is mailed it, and an
// app page lists the stored ones.
import * as z from "zod";

/** A stored message. */
export const Message = z.object({
  body: z.string(),
  createdAt: z.string(),
  email: z.string(),
  id: z.string(),
  name: z.string(),
});
export type Message = z.infer<typeof Message>;

/** What a visitor sends: the id and the time are the server's. */
export const NewMessage = z.object({
  body: z.string().trim().min(1).max(2000),
  email: z.email().max(254),
  name: z.string().trim().min(1).max(100),
});
export type NewMessage = z.infer<typeof NewMessage>;
