# Step 2: Product brief

What the product is, who uses it, how it makes money, and the first features,
written as product docs and specs before any design or code.

**Needs:** step 1 done (the name, language, market).

**Fills:** `<billing-unit>` (`fills.json` lists its files).

## Asks

One question per message, in this order. This is an interview about the
product, not a form: follow up where an answer is thin, still one question at
a time.

1. **The problem:** who has it, and what they do about it today.
2. **The people who use the product** (the actors): each kind of person, where
   they are when they use it (on a phone on the go, at a desk), and what they
   worry about. Usually two to four.
3. **The first flows:** the handful of things those people must be able to do
   in the first version, ranked. Recommend the smallest set that delivers the
   promise; the rest goes to "Not in this version".
4. **Words with one meaning:** the product's own terms (what it calls a
   project, a booking, a member), for the glossary.
5. **How it charges:** per user, per workspace, per order, per event, per
   seat, a flat plan, or another unit; free to start or not. The answer is the
   **billing unit**: the one thing whose cost the project must be able to
   measure (root `CLAUDE.md`, "The cost of each `<billing-unit>` is
   measurable"). A flat plan still picks the unit its costs grow with.
6. **The market's review sites:** where its users write about products like
   this one (for `market.md` and the `competitor-intel` skill), and any known
   competitors.

## Writes

- **`docs/product/shared/market.md`:** the market, the language and its
  direction (from step 1), Google's `gl` and `hl` codes for them, and the
  review-site table; the stub note goes.
- **`docs/product/shared/actors.md`** and **`glossary.md`:** a row per actor
  and per term, each with a kebab-case ID that never changes. The notes above
  the tables lose their **Stub** label and keep their ID rules.
- **`docs/product/CLAUDE.md`, "What the product is":** two or three
  sentences in the owner's words (who it is for, what it lets them do, the
  promise), replacing the paragraph that says the bootstrap writes it.
- **`<billing-unit>`:** filled in the root `CLAUDE.md`'s cost rule as the
  unit's singular noun (`workspace`, `order`), so the rule reads "The cost of
  each `workspace` is measurable"; the parenthetical saying step 2 names it
  goes. (The file's paragraph on the skeleton keeps its `Skeleton:` marker
  until step 6.) The rule's storage-key sentence then names
  the unit's prefix (`workspaces/{workspaceId}/…`). The code keeps its
  generic `unitId` (`backend/src/platform/log-context.ts`); the first feature
  that stores a unit uses the real name in its keys.
- **The first specs:** one per first flow, through the `product-spec` skill,
  in its batch mode: drafted, with the owner-level questions labelled for the
  next review batch (`/review-batch <n>`). The interview above is the skill's
  intent interview; do not ask it again. This step stands in for the batch
  lead: it writes the shared files above itself (batch mode's drafter does
  not), and leaves the spec index in `docs/product/CLAUDE.md` empty, since a
  spec joins it when the owner approves it. The design review (batch mode's
  step 6) is this step's too: run the `design-researcher` on each draft if
  this session can start an agent; if not, write the spec's *Design review*
  log entry as "did not run: the bootstrap could not start an agent" and add
  a child bead, labelled for the same batch, to run it before the owner
  reviews.
- **The first beads:** an epic per first feature, each child a spec to draft
  or a decision to make, and an epic for the bootstrap's remaining steps.
- **The anchor beads,** only if `pnpm rename` did not file them (it does,
  `tools/bootstrap/CLAUDE.md`; `bd list --label inherited --all` shows them):
  `pnpm rename --resume` files them; never twice.

## Records

- BS rows: the billing unit, and why it is the one costs grow with; how the
  product charges (free tier, plan), as far as the owner decided it; which
  flows are first and which wait.
- The product itself (actors, flows, rules) is not recorded here: it lives in
  the specs and `docs/product/shared/`.

## Done when

- `market.md`, `actors.md` and `glossary.md` carry no **Stub** label, and
  `docs/product/CLAUDE.md` says what the product is.
- `git grep -F '<billing-unit>'` finds it only in the bootstrap's own files,
  tests and the template-build log
  (`docs/decisions/2026-10-21-template-build-decisions.md`).
- Each first flow has a spec in `docs/product/` (status `draft` is enough)
  and an epic in the tracker; the owner-level questions are labelled
  `batch-<n>`.
- `pnpm competitors check` passes (it reads the actors and glossary tables).
  It checks nothing until `docs/competitors/` exists, which only the
  `competitor-intel` skill creates; a competitor the owner named goes in
  `market.md` and a bead to profile it with that skill, labelled for no
  batch.
