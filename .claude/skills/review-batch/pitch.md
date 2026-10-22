# The pitch

Every card on a review page opens with a pitch: one screen the owner reads in
about a minute to judge whether the draft goes in the right direction. The full
draft sits behind it, one click away. Write the pitch last, from the finished
draft; it must never promise what the draft does not say.

## Six parts, always in this order

Return them as the `pitch` object of a card (`tools/review-batch/src/cards.ts`):

| Field | Part | Rules |
|---|---|---|
| `what` | **What it is** | One sentence, in the owner's words, no IDs. What the person gets, not how it is built |
| `who` | **Who uses it, and when** | One sentence: the actor, the device, the moment. For a decision: who is affected |
| `journey` | **The journey** | 1 to 5 short steps, the P1 journey only. For a decision: the options, the recommended one first, marked "(recommended)" |
| `included` | **In** | Up to five items this draft commits to |
| `left` | **Left out** | Up to five items deliberately not in it, each a few words; the owner checks nothing important is missing |
| `competitors` | **What competitors do** | One or two lines from `docs/competitors/`, each naming the competitor. Empty when no profile covers it |
| `calls` | **Your calls** | Up to three `{ question, recommendation }`: the product calls the draft could not settle alone. A findings card lists every finding as a call, with the recommended action |

## Writing a call

- **The question is one decision**, answerable in a sentence: "Must a project
  have a closing date before it is published?" Never "What do you think of
  the rules?".
- **The recommendation is the answer you would pick**, stated as the answer:
  "Yes, 30 days after the start by default." The page preselects it; the owner
  writes something only where they disagree.
- **Only real product calls.** Obvious answers are assumptions in the draft's
  §9, which the owner can veto in a note. A call the owner must answer before
  anything can be built beats three small ones.

## Style

Plain words, short sentences, the glossary's word for each concept. No
technology, no IDs in `what` and `who`, no "we will". Text the owner will see
on screen stays in the product's language (`docs/product/shared/market.md`);
everything else in English.

## An example

```json
{
  "what": "A team lead creates a project, fills in its title and description, and publishes the members' link.",
  "who": "A team lead, on a computer, when the work starts.",
  "journey": [
    "Opens the dashboard and starts a new project",
    "Fills in the name, start date, title and description",
    "Chooses how long the project stays open",
    "Publishes, then copies the link or the QR code"
  ],
  "included": ["Title and description", "Closing date: 30 days after the start by default, up to six months", "The member link and its QR code"],
  "left": ["Co-leads and roles", "Acme sending the link (the messaging spec)"],
  "competitors": ["ExampleCo asks for the start date first and shows a live preview."],
  "calls": [
    {
      "question": "Must a project have a closing date before it can be published?",
      "recommendation": "Yes, 30 days after the start by default."
    }
  ]
}
```
