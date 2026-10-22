# A recommendation

The full draft behind a decision card (an owner decision such as O9, or a
setting such as where DNS lives). The owner approves or rejects the
recommendation; the page's pitch summarises it, and this is what "Full draft"
shows. Write it as Markdown, in this shape and order:

```markdown
# <The question, as a question>

**Bead:** acme-<id> · **Decides:** <O-number or D-number, if any>

## Recommendation

<The answer, in two or three sentences, as it would be recorded.>

## Why

<The reasons, most important first. Cite the decisions and specs it rests on
by ID (O4, SCG-R12), and the numbers with their sources.>

## Options rejected

| Option | Why not |
| --- | --- |
| <option> | <one line> |

## What it changes

<Which beads, specs, docs or code this settles or unblocks, by ID; anything it
reverses or amends.>

## How hard it is to undo

<Easy / costly / one-way, and why. Name the moment after which changing it
costs more (first deploy, first real user, first paying customer).>

## Sources

<Links or file paths for every fact above that is not already in the repo.>
```

## Rules

- **One recommendation.** Never "either A or B, you choose": pick one, and put
  the other in *Options rejected*.
- **Every number has a source**, a date, and, for prices, the region
  (the project's, in `deploy/accounts.json`).
- **Research is verified, not remembered**: a claim about a service, a price
  or a law is checked this session, and its source is listed.
- **No new decisions hidden inside.** A question the recommendation raises
  becomes one of the card's calls, or a note under *What it changes*.
- **When it is approved** the apply step records it as a `Decided:` line in
  the decisions doc that holds the question (backend `O`: 
  `docs/decisions/2026-09-25-backend-decisions.md`; frontend `D`:
  `docs/decisions/2026-09-24-frontend-open-decisions.md`; platform:
  `docs/decisions/2026-09-28-aws-account-decisions.md`), and posts the full
  text as a comment on the decision's bead. Write it so it can be pasted there
  unchanged.
