# Brief for a drafting agent

The batch lead gives this brief to each drafting subagent, with the item's
bead ID, its kind, the batch branch's worktree path, and the wave it belongs
to. Everything below is addressed to the drafter.

## Your job

Draft one item for the owner's review batch, completely, without asking the
owner anything. The owner will judge your work from a one-page pitch and
approve, reject or annotate it on a review page. Every question you would have
asked becomes either a **call** on the card (up to three, each with your
recommendation) or an **assumption** in the draft that the owner can veto.

You work in the batch worktree the lead named. Write only the files your item
owns. A **docs** item owns the shared files its bead names: change those, and
nothing else. Every other kind **never edits shared files**: the glossary and actors
(`docs/product/shared/glossary.md`, `actors.md`), every other shared rule
file in `docs/product/shared/` (privacy and language rules, for example), and the spec index
(`docs/product/CLAUDE.md`). Propose additions to them in your draft's log
instead (for a spec: §10 *Clarifications*, one line per proposed term, rule or
actor). Do not commit; the lead commits.

## Read first

1. The bead: `bd show <id>` and `bd comments <id>`: what it is for, what it
   needs, and what makes it done.
2. The decisions it rests on, named in the bead and its comments: read their
   full records (`bd comments <id>`, and the decisions docs in
   `docs/decisions/`).
3. `docs/competitors/landscape.md`, and the profiles of the competitors that
   cover your feature (`docs/competitors/<slug>/profile.md`), when the
   project has any.
4. The specs your item builds on, and the drafts of earlier waves the lead
   names.

## By kind

- **spec**: run the `product-spec` skill in **batch mode** (its section
  *Batch mode*) to write `docs/product/<feature>.md`. You cannot start the
  design researcher yourself (a drafting agent cannot start another agent),
  so at step 6 ask the lead to run it: stop, and return only
  `{ "needsDesignReview": "docs/product/<feature>.md" }`. The lead runs it and
  sends you its findings in a message; then finish step 6 as the skill says
  (fix what is plainly a mistake, turn product calls into calls, write the
  *Design review* log entry) and carry on to the end.
- **decision**: write the recommendation in the shape of
  `.claude/skills/review-batch/recommendation.md`, to
  `docs/reviews/batch-<n>/<bead-id>.md` in the batch worktree.
- **docs**: make the change the bead describes to the files it names, in the
  batch worktree, as a draft the owner approves.
- **findings**: read the review that raised them (the bead names it). For each
  finding, decide the action you recommend: revise the spec (name the IDs and
  what changes), keep it as it is (say why), or defer it (to what). Each
  finding becomes one call. Write the reasoning, one short paragraph per
  finding, to `docs/reviews/batch-<n>/<bead-id>.md`.

- **sweep**: a root cause the consistency sweep found. Its bead's design
  field is JSON: `findings` (each with `sides`, `reach`, `prediction`,
  `proposedFix`), `timelines` (when each side was written and changed, and
  whether the owner approved it), `match`, `truthChanging`. Write
  `docs/reviews/batch-<n>/<bead-id>.md`: each side quoted with its place; its
  timeline; every place in the reach; whether a test pins the code side; the
  prediction and the rule behind it; and **every edit the fix makes**, place
  by place, with the exact text before and after (or "link to <home>", or
  "removed"). Where code loses, the edit is a bug bead with a test, not a code
  change. The pitch: *what* is the claim and the fix; *who* are the people or
  agents each side reaches; *journey* is the timeline, one step per change
  (at most five, oldest first); *included* lists every place the fix
  changes; *left* what it leaves (history, a code fix waiting for its bug);
  *competitors* is empty. Decide what you draft for: in round 1, the
  prediction (or, when it is `null`, the side you recommend, or "both
  wrong"); in a redraft, the owner's call from the round before, in its
  comment. Add `draftedFor` (that side's ref, `both-wrong` or
  `not-a-contradiction`) and `winners` (`{ "<SW-id>": <index of the winning
  side in that finding> | "both-wrong" }`) to the bead's design JSON with
  `bd update --design-file`, keeping what is there. The **first call** is
  "Which side is right?", recommending `draftedFor` in its own words; the
  owner may answer another side, "both wrong", or "not a contradiction". A
  losing decision is never rewritten (H6): the fix adds a new `Decided:`
  entry naming the old one, which is marked superseded.

## What you return

Your final message is one JSON object, the card, in the shape of
`tools/review-batch/src/cards.ts`:

```json
{
  "id": "acme-…",
  "round": 1,
  "title": "the bead's title",
  "kind": "spec | decision | docs | findings | sweep",
  "unblocks": ["the titles of the beads that depend on this one"],
  "pitch": { "what": "", "who": "", "journey": [], "included": [], "left": [], "competitors": [], "calls": [] },
  "draftFile": "the path of your draft, relative to the worktree",
  "blocked": "only when you could not finish: what is missing, in one sentence"
}
```

Write the pitch last, following `.claude/skills/review-batch/pitch.md`. The
lead reads `draftFile` into the card's `draft`. If you cannot finish (an input
is missing, or the item depends on a decision nobody has made), return the card
with `blocked` set and whatever you did draft; never stop to ask.
