# docs/superpowers/specs/

Technical designs: how a feature is built, written after its product spec in
`docs/product/` and before its plan in `docs/superpowers/plans/`. The
`superpowers:brainstorming` skill writes them; these rules come from the owner
and override the skill wherever they differ.

## Who reviews a design

- **A second agent reviews every design written in batch mode** (drafted by an
  agent without the owner, for a review batch) before its plan is written: a
  fresh subagent, given the design, the product spec it serves and the
  decisions it rests on. It decides how to review. The author fixes what it
  finds. A design the owner approved in conversation, section by section, has
  had its review and needs no second one.
- **Only owner-level choices go to the owner:** a change a user would notice,
  a break of a recorded principle or decision, or an exception to the library
  guidelines. A change a user would notice goes back to its product spec, in
  the `product-spec` skill's revision mode. Every owner-level choice becomes an
  item in the next review batch (label `batch-<n>`, see the `review-batch`
  skill), never a question in conversation, and work that does not depend on
  it continues.
- **Every other choice is the author's.** The design states it with its
  reason, and the plan builds on it.

## Header

- **Every design names its beads in its header:** a `**Beads:**` line within
  the first 15 lines (the epic, or the bead the design serves). `pnpm sweep lint`
  fails without it, because the sweep finds executed designs by their beads'
  status (`docs/superpowers/specs/2026-09-30-sweep-design.md` §10).
