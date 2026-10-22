---
name: bootstrap
description: Use when the owner types /bootstrap (optionally a step name, such as /bootstrap accounts), or asks to set up, start, continue or finish turning this template into their project. Runs the seven bootstrap steps in order, one question at a time, resuming where the last run stopped, and records every answer that is a decision in docs/decisions/.
---

# Bootstrap

Turns a fresh copy of the template into the owner's project, once: its name,
its product, its owner's tools, its brand, its components, its first real
feature in place of the skeleton, and, when the owner wants, its AWS
accounts. Each step can run alone, and records where it got to, so the owner
can stop and come back.

The bootstrap **only drafts.** The owner's answers are decisions and are
recorded as theirs; anything the bootstrap writes from them (a spec, a
palette, a voice) is a draft the owner approves on the review page or the
inbox, as the root `CLAUDE.md` says ("The owner decides in batches"). Never
hold work waiting on that approval: build on the draft, label its bead for
the next batch, and go on. The next batch is `batch-<n>` with `<n>` one more
than the highest batch label in use (`bd label list-all`), so `batch-1` in a
fresh project; every step of one bootstrap run labels for that same batch.

## The steps

| #   | Step              | File                          | Runs                                                        |
| --- | ----------------- | ----------------------------- | ----------------------------------------------------------- |
| 1   | Basics            | `steps/1-basics.md`           | First: the name (the rename), domain, language, market, region |
| 2   | Product brief     | `steps/2-product-brief.md`    | After 1: the product, its users, how it charges, first specs |
| 3   | Owner setup       | `steps/3-owner-setup.md`      | After 1: GitHub, the branch rule, the inbox, owner-only steps |
| 4   | Design system     | `steps/4-design-system.md`    | After 2: brand, tokens, font, `DESIGN.md`, the copy guide   |
| 5   | Scaffold          | `steps/5-scaffold.md`         | After 4: shadcn style and library, base components, locale  |
| 6   | Replace skeleton  | `steps/6-replace-skeleton.md` | Once the first real spec has a design and a plan            |
| 7   | Accounts          | `steps/7-accounts.md`         | Optional, any time after 1: AWS, `deploy/accounts.json`     |

`/bootstrap` alone runs the next step. `/bootstrap <name>` (`basics`,
`product-brief`, `owner-setup`, `design-system`, `scaffold`,
`replace-skeleton`, `accounts`, or the number) runs that step alone, after
checking the step's **Needs** line. A step already done is run again only when
the owner asks; it then changes what it wrote before, and records the change
as a new decision row that supersedes the old one.

## Resuming: `.bootstrap/state.json`

Progress lives in `.bootstrap/state.json`, committed with the work, so it
travels with the repo. Never edit it by hand; use the state command:

```bash
pnpm bootstrap:state                 # each step's status, then "next: <step>"
pnpm bootstrap:state done <step>     # at the end of a step, once its Done when holds
pnpm bootstrap:state defer accounts  # the owner leaves step 7 for later
```

The rule (`nextStep` in `tools/bootstrap/src/bootstrap-state.ts`): the next
step is the first of 1 to 6 not done; then step 7 unless it is done or
deferred; then nothing. A state file that is not one stops the command with
the reason; fix it from git history, never by guessing which steps ran.

Every run starts the same way:

1. Run `pnpm bootstrap:state` and read `next:`.
2. Read `.claude/skills/bootstrap/fills.json` and the step's file.
3. Read the bootstrap decisions log (below), if step 1 has written it, so no
   question already answered is asked again.
4. Tell the owner, in one line, which step this is and roughly how many
   questions it asks.

## Interviews

- **One question at a time**, one per message. Never a list of questions.
- Multiple choice where the answers are known, with your recommendation first
  and its reason in one line; open questions only where nothing can be
  offered (the product's name, what it does).
- The owner may answer "you choose": take your recommendation, and record it
  as the author's call with its reason, so the review batch can ask it again.
- Ask only what the step's **Asks** section lists, in its order, skipping what
  the decisions log already answers. Questions the step does not list wait
  for the work that needs them.
- Keep the owner's own words for anything a user will read (the product's
  description, its voice); rewrite only for length.

## Fill tokens: `fills.json`

The template carries placeholders, such as `<region>` and
`<owner-inbox-url>`, that a step replaces with an answer.
`.claude/skills/bootstrap/fills.json` is their registry: keyed by the exact
token, each entry names the step that fills it and every file that carries it
(TB87). A step fills **every** file listed for its tokens, then checks with
`git grep -F '<token>'` that none is left. Where a sentence explains the
placeholder rather than holding a value, rewrite the sentence so it reads
right with the value; the step file names those sentences.

`tools/bootstrap/src/fills.test.ts` holds the rule: until a step is done, its
tokens are in exactly the listed files; once it is done, in none. So mark a
step done only after its tokens are filled, and run its checks after marking
it. A token whose value changes later (a provisional domain made real) is
replaced in the same files, which the entry still lists.

The seed memories (`.beads/seed-memories.json`) carry tokens too. After
filling one, import the memory again so the tracker holds the filled text:
`bd remember --key <key> "<the memory's new text>"` (it updates in place).

## The skeleton marker

The template's demo files open with a comment that starts `Skeleton:`, and
step 6's table lists every one of them. Only step 6 removes the marker. A
step before it that edits a marked file (step 4's `fonts.ts`, step 5's e2e
spec) keeps the `Skeleton:` word at the start of that comment, rewording only
the rest; `tools/bootstrap/src/skill.test.ts` fails on a marker gone early.

## Decisions: the bootstrap log

Step 1 creates `docs/decisions/YYYY-MM-DD-bootstrap-decisions.md` (the date
step 1 ran), and every step adds rows to it. The format is the template-build
log's (`docs/decisions/2026-10-21-template-build-decisions.md`):

- a header: the title "Bootstrap decisions", a `**Decided:**` line with the
  dates and the owner's name, and one paragraph saying what the log holds;
- one table, `| # | Decision | Why | Date |`, IDs `BS1`, `BS2` and on, never
  renumbered;
- each row says who decided: "Owner" for an interview answer, "Author's call"
  for one the bootstrap made, with its reason;
- a later row that replaces one marks the old one *Superseded by BS<n>*, and
  the same goes for an inherited decision the answer changes (for example A2,
  the three accounts, when the owner picks one account).

A step's **Records** section lists the rows it adds. Product behaviour is not
recorded here: it goes in the specs, through the `product-spec` skill.

## Ending a step

1. Check the step's **Done when** list, item by item.
2. `pnpm bootstrap:state done <step>` (or `defer accounts`).
3. `pnpm fix`, then `pnpm check --concurrency=2`, and `pnpm sweep lint`. A
   failure is the step's to fix before the next one starts.
4. Commit the step as one change, `chore(bootstrap): <step>`, with the state
   file in it. Push only if the owner asked.
5. Say what was written, what waits on the owner (and where: the review page
   or the inbox), and which step is next.

## Finishing

When `pnpm bootstrap:state` says `next: none` (steps 1 to 6 done; step 7
done or deferred), remove what only the template needed, as one change:

- **The rename's copy check:** the `rename-copy` suite in
  `tools/local-check/src/plan.ts`, its name in the lists and its own test in
  `tools/local-check/src/plan.test.ts`, its line in
  `tools/local-check/src/flows.test.ts`, and its mention in
  `tools/local-check/CLAUDE.md`.
- **The rename:** in `tools/bootstrap/src/`, `rename.ts`, `rename.test.ts`,
  `rename-copy.ts`, `cli.ts`, `finish.ts`, `finish.test.ts`, `tracker.ts`,
  `tracker.test.ts`, `tracker-config.ts`, `tracker-remote.test.ts` and
  `drop-remote.ts`; the `rename` and `tracker:drop-remote` scripts in the root
  `package.json`; their entries in
  `tools/bootstrap/knip.json`; the `pnpm rename` lines in the root
  `CLAUDE.md` (Build & Test, and the `tools/bootstrap/` line, which becomes
  "pnpm bootstrap:state: where /bootstrap stands") and in `README.md`, whose
  "Start a project from it" section (copy the template, `pnpm rename`,
  `/bootstrap`) is rewritten to the commands a clone of the finished project
  needs (`pnpm install`, `pnpm dev`) and its opening line to match;
  `tools/bootstrap/CLAUDE.md`'s rows for them and its intro and Rules prose
  about the rename and the marker file; and the `description` in
  `tools/bootstrap/package.json`, which becomes the state command's.
- **Kept:** `.bootstrap/state.json` and `.gitkeep` (the fills and step 6
  tests read the state, and a deferred step 7 still runs from it), this
  skill, `fills.json`, `tools/bootstrap/src/bootstrap-state.ts`,
  `state-cli.ts` and their tests. The deploy guard
  (`deploy/src/bootstrap-guard.ts`) stays: with step 6 done it refuses
  nothing, and it reads a missing state file as a finished bootstrap. The
  template-build log stays as the record of why the harness is as it is.

Run the checks, record one row ("the bootstrap finished; removed: …"), and
commit it as `chore(bootstrap): finish`.

## Trial runs

A trial proves the skill on a throwaway copy. Another agent plays the owner,
answering from `.claude/skills/bootstrap/trial-brief.md` and nothing else; a
question the brief does not answer is answered "you choose". Nothing leaves
the machine except the trial's inbox page: no GitHub repository, branch rule,
AWS call or push. The page gets one item, enough to prove adding and reading
one works (step 3's repository and branch-rule item); the other owner-only
steps are beads only, and step 3's _Done when_ counts them that way. A trial
runs the full _Ending a step_ checks after every step, not only at the end:
a template defect then shows at the step that meets it. Delete the trial's
page and copy only once the owner says so.
