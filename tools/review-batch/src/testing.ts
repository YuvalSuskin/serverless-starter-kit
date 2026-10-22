// Test helpers for @acme/review-batch.
import type { Card } from "./cards.ts";

export function sampleCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "acme-abc",
    round: 1,
    title: "Spec: create, edit and publish a project",
    kind: "spec",
    unblocks: ["acme-def"],
    pitch: {
      what: "The owner creates a project and publishes its share link.",
      who: "An owner, on a computer, a week before the launch.",
      journey: ["Opens the app", "Fills in the project", "Publishes"],
      included: ["Cover and welcome text"],
      left: ["Co-owners"],
      competitors: ["Competitor A asks for the date first."],
      calls: [
        { question: "Is the closing date required?", recommendation: "Yes, 30 days by default." },
      ],
    },
    draft: "# Project\n\nThe full spec.",
    ...overrides,
  };
}
