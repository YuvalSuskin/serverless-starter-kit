// Skeleton: the template's demo seed, replaced by bootstrap step 6.
import type { Message } from "@acme/contracts";

import type { FakeMessageStore } from "../../fakes/message-store";

// What `pnpm dev` starts with, and what the sweeps and end-to-end tests stand
// on: a fresh dev server shows each resource in a realistic state, so nothing
// has to be created by hand before it can be seen.

/** Three visitors' messages, so a fresh `pnpm dev` lists something. Oldest dates: real sends are newer. */
export const SEED_MESSAGES: readonly Message[] = [
  {
    body: "Hi! Do you have any dates free in the spring?",
    createdAt: "2025-12-01T09:15:00.000Z",
    email: "maya@example.test",
    id: "01900000-0000-7000-9b00-000000000001",
    name: "Maya Cohen",
  },
  {
    body: "Could you send me your price list, please?",
    createdAt: "2025-12-02T14:40:00.000Z",
    email: "daniel@example.test",
    id: "01900000-0000-7000-9b00-000000000002",
    name: "Daniel Levi",
  },
  {
    body: "Thank you for the quick reply yesterday. We would like to book.",
    createdAt: "2025-12-03T08:05:00.000Z",
    email: "noa@example.test",
    id: "01900000-0000-7000-9b00-000000000003",
    name: "Noa Barak",
  },
];

export function seedMessages(store: Pick<FakeMessageStore, "seed">): void {
  for (const message of SEED_MESSAGES) store.seed(message);
}
