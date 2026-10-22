import * as z from "zod";

// Every list route returns a Page. The cursor is opaque to the
// client; the backend binds it to the event it came from.
export const page = <Item extends z.ZodType>(item: Item) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export interface Page<Item> {
  items: Item[];
  nextCursor: null | string;
}
