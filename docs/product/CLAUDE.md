# docs/product/

Product specs: what the product's users see and do, without technology or
visual design. Each feature has one living spec here. The `product-spec`
skill (`.claude/skills/product-spec/`) writes and revises them.

## How to work here

- Work that changes what a user sees or does starts here: write or revise
  the feature's spec with the `product-spec` skill before technical design.
  Work no user would notice (logging, cost, infrastructure) needs none.
- Specs are usually drafted in review batches: `/review-batch <n>` drafts
  every spec labelled `batch-<n>` in the skill's batch mode, and the owner
  approves them on one review page. The conversational mode, with its gates,
  remains for when the owner wants to write a spec together.
- Cite IDs (`FEAT-R8`, `LANG-1`). Never restate a shared rule, and never
  repeat a limit's value outside its Limits table.
- Never reuse an ID. Strike a dropped item through and mark it withdrawn,
  with the date and the reason.
- A spec states only what the product will do. Uncommitted ideas go in its
  "Not in this version" section.
- Design links are references. Where a design and a spec disagree, the spec
  wins until it is revised.
- Every place states what the person is there to do (**Here to**) and names
  its main affordance (**Main**), or says it has none. Design takes a
  screen's main action from there (`design/DESIGN.md`).

## What the product is

The bootstrap's product-brief step (`/bootstrap`, step 2) writes the market,
the language and the review sites into `shared/market.md`, and the first
spec says what the product is and who it is for. Until then this folder holds
no spec.

## Actors

Who uses the product and where: `shared/actors.md`. The first spec that needs
an actor adds it there.

## States every spec considers

Every place in a spec has the five core states: **ideal, empty, loading,
partial, error**. The spec also specifies each shared state below for the
place, or lists it as not applicable, with the reason:

| State                | Means                                                              |
| -------------------- | ------------------------------------------------------------------ |
| Offline              | The device has no connection, or loses it partway                  |
| Permission denied    | The user declined access the place needs (camera, photos, location) |
| Link not valid       | The link the user arrived from is wrong, or no longer works        |
| Closed or expired    | The item no longer allows something it used to                     |
| Pending approval     | Something the user added waits for someone's review                |

## Shared rules

Full text in `shared/`. Cite by ID; never restate. A rule that more than one
spec follows (language and direction, privacy and consent, the glossary of
terms) goes in `shared/` with a stable ID the first time a second spec needs
it. `shared/README.md` says what belongs there. Until a spec adds one, only
the three files the bootstrap fills there exist.

Glossary terms and actors carry stable IDs, which other docs link to. An ID
never changes and is never reused; a dropped entry is struck through, not
deleted.

## Spec index

| Spec | Prefix | Status | Covers |
| ---- | ------ | ------ | ------ |

A spec marked `revised` may carry an **Approved:** line in its header: the
owner approved the revisions it names (each marked in the changelog), and every
later revision still awaits the owner. Only a spec all of whose revisions are
approved is marked `approved`.
