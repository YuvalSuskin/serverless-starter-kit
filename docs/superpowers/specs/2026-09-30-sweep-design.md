# Consistency sweep: one source of truth

**Status:** approved in conversation, section by section, 2026-09-30 (Yuval Suskin); written up the same day
**Beads:** `acme-tf8` (inherited design; the template tracker's anchor for it)

## 1. Why

The repo holds the owner's decisions in many places: decision logs, product
specs, design specs, plans, `CLAUDE.md` files, skills, `bd` memories, beads, and
the code itself. They were written days apart, by the owner and by agents, and
nothing keeps them in step. A rule restated in three places drifts in three
directions; an executed plan still reads as current; a memory repeats a rule a
`CLAUDE.md` already holds. An agent that reads the wrong one builds the wrong
thing.

The owner wants a repeatable sweep that brings the repo to a **final** state
and keeps it there, without burying the owner in questions, and that learns
from every contradiction it resolves.

## 2. What "final" means

1. **No two live texts disagree**, and the code agrees with them.
2. **Every rule has one home.** Anything else that needs it links there
   instead of restating it.
3. **Nothing reads as current that is not.** History lives in `docs/archive/`.

### Canonical homes

| Truth | Home |
|---|---|
| An owner decision and its reason | `docs/decisions/` (the `Decided:` entry) plus its decision bead (the full record), as H5 sets out: one decision in two views joined by its ID. The sweep checks the two agree; it never raises them as duplicates |
| What users see and do | `docs/product/` |
| How to work in a component | that component's `CLAUDE.md` |
| How a recurring task runs | its skill |
| Design values | `design/tokens/tokens.json`, `design/DESIGN.md` |
| What the system does | the code and its tests |
| Work to do | beads |
| Workflow knowledge that cuts across components and has no other home | a `bd` memory, kept tiny (H5, §11) |

## 3. What it is

| Piece | Where | What it does |
|---|---|---|
| `/sweep` skill | `.claude/skills/sweep/SKILL.md`, with `checker.md` and `verifier.md` briefs | Makes the session the sweep lead: `/sweep` runs a full sweep, `/sweep --continue` runs the next pass after a batch is applied |
| Saved workflow | `.claude/workflows/sweep.js` | Fans out one checker per topic and one verifier per finding; resumable, results cached. It takes topic names; each checker reads its topic from the run's `topics-named.json` (S8) |
| `tools/sweep` | `pnpm sweep <command>`, package `@acme/sweep` | Every deterministic step: snapshot, graph, rank, timeline, archive, lint, ledger, verify, state (§12) |
| Ledger | `docs/sweeps/ledger.jsonl` | One line per resolved contradiction, with all its metadata (§9) |

Resolutions go through the existing review batches (`/review-batch <n>` and
`apply`). The sweep never changes the truth on its own.

## 4. Scope

**The live set** (swept): `docs/decisions/`, `docs/product/`, live specs,
plans and research under `docs/`, every `CLAUDE.md`, `design/*.md`,
`.claude/skills/**`, `.claude/agents/**`, `bd` memories, open beads, closed
beads labelled `decision`, and the code.

**Checked for links only:** `docs/archive/`, and `docs/reviews/` (the drafts
and records of review batches: history once a batch is applied; the decisions
they carried live in their homes).

**Out of scope:** `docs/competitors/` (outside facts, kept by
`competitor-intel`), generated files (`design/tokens/tokens.css`).

## 5. A run: `/sweep`

1. **Prepare.** `bd dolt pull`, `git fetch origin main`; work from a clean
   checkout of `origin/main`. A run's working files go in
   `.superpowers/sweep/<run>/` (git-ignored). Stop if the worktree is dirty.
2. **Snapshot.** `pnpm sweep snapshot` writes open beads (read in full with
   `bd show --json`), closed `decision` beads, and memories as markdown, one
   file per item. It writes bead dependencies and parents as `[[<bead-id>]]`,
   file paths a bead names as relative links, and decision IDs (A8, B4,
   FEAT-R63) as `[[<id>]]`, so the graph joins them to the docs that share
   them. Findings cite `bead:<id> (<field>)` or `memory:<key>`, never the
   scratch file.
3. **Index.** `pnpm sweep graph` runs Graphify headless over the live set, the
   snapshot and the code (§13), staged and cached in one lasting folder,
   `.superpowers/sweep/cache/`, so Graphify's own incremental update works
   across runs, and writes the run's `topics.json`:
   Graphify's communities with their files, passages and code paths. Ranking
   counts only extracted edges and code imports, not inferred ones.
4. **Topics.** The lead merges and names the communities into 5 to 8 topics.
5. **Check.** The workflow runs one checker per topic. Each lists the
   topic's claims, compares them, checks every claim it can against the code,
   notices restatements, stale text and archive candidates, and reports
   findings in the schema, each side quoted exactly with `file:line`. The
   checker brief includes every settled item from the ledger (§8).
6. **Verify.** The workflow runs a verifier per finding, which re-reads the
   original lines and drops what is not real.
7. **Match.** Each surviving finding is matched against the ledger by
   fingerprint (§8): regressions and suppressed findings are routed there.
8. **Group, rank, file.** Findings are grouped by root cause; one bead per
   root cause under the run's epic "Sweep <date>", labelled `sweep`. `pnpm
   sweep rank` orders them (§7); the top 8 to 10 get `batch-<n>`, the rest
   `sweep-queue`.
9. **Record.** `pnpm sweep state set` writes `sweep/last-run` in `bd kv`: the
   commit, the date, the graph cache key, the next `SW-` number.

## 6. Findings

Every finding has an ID (`SW-014`), a fingerprint (§8), a kind, two or more
sides, a proposed fix, and a **prediction**.

| Kind | What it is | Fix |
|---|---|---|
| Conflict | Two live texts disagree | The owner chooses; the other side is rewritten |
| Code drift | Code and a live text disagree | A bug bead if the text is right, a text edit if the code is |
| Unrecorded decision | Code makes a user-visible choice no text covers | A drafted decision entry |
| Unmarked supersession | A newer decision replaced an older one that still reads as current | H6's protocol: `bd supersede`, current-state text (status tables, `CLAUDE.md` lines, memories) pointed at the new ID; the old entry's text is never rewritten |
| Duplicate | A rule stated outside its home | Keep the home; elsewhere, link |
| Promote | A memory that repeats a rule a `CLAUDE.md`, skill or decision already holds, or that is about one component (H5) | `bd forget`, or move it to that component's `CLAUDE.md` |
| Archive | Executed plan or spec, or research whose decisions are made (§10) | Move surviving truth home, then archive |

### Truth-changing and truth-preserving

- **Truth-changing** (conflict, code drift, unrecorded decision): every one
  reaches the owner, as one card per root cause.
- **Truth-preserving** (unmarked supersession, duplicate, a promote whose rule
  its home already states word for word in substance, and archive where
  everything true is already homed): no card. They are applied in the batch's
  PR and listed there, one line each. Each is revertible: a forgotten memory's
  text is kept in its ledger line, so `bd remember` restores it. They are
  recorded in the ledger with the answer `auto`.
- A promote that would write new text into git, and an archive whose spec still
  holds unhomed rules, are truth-changing: they get a card that shows what
  moves where.

### Prediction, not precedence

A fixed precedence would guess wrong: a spec can be wrong because the code
taught us something, and code can be wrong because it misread the spec. So
precedence runs only as a **prediction**, the card's preselected
recommendation, and is logged. The first rules:

1. An approved decision outranks everything; between decisions, the newer one
   that names the older wins.
2. A product spec outranks a design spec or plan on what users see.
3. A `CLAUDE.md` or skill outranks a plan on how to work.
4. Code outranks a plan or design spec on what the system does.

Automating a class of contradiction is itself a decision card, raised only
when the ledger shows the prediction reliably matched the owner (§9).

### The card

Each card shows:

- **Every side**, quoted, with its location.
- **A timeline** from `pnpm sweep timeline`: when each side's lines were
  written, last changed and approved, from `git blame` on the line range, not
  the file name. Each entry names the commit, its message and the PR, and
  whether the owner approved that text: a `Decided:` or `**Status:** approved`
  line, a review-batch apply commit, or a commit without the
  `Co-Authored-By: Claude` trailer (nearly every commit carries it, so the
  trailer alone says nothing). Beads use `created_at` and `updated_at`;
  memories, Dolt's history.
- **Reach**: every other place that holds the claim (graph neighbours and
  grep across docs, beads, memories, code). The fix covers all of them, and
  the owner approves the whole list.
- **Tests**: whether a test pins the code side.
- **The prediction**, preselected, and the suspected cause.

**The owner's answer** is a call on the card: which side wins, both wrong, or
not a contradiction, with the prediction preselected. A choice other than the
one the fix was drafted for sends the card back to drafting, for the next
round. **Later** on a sweep card moves it to `sweep-queue` with the label
`owner-deferred`, never to the next batch number.

## 7. Batches and the loop

**Ranking.** `pnpm sweep rank` orders root causes by:

- **graph reach**, from extracted edges and code imports only;
- **blocks open work**: open beads that depend on the affected area;
- **user-visible**: the finding touches `docs/product/` or user-facing code.

Graph reach alone would favour whatever is written about most (process docs,
duplicated rules), so it is one signal of three. The formula is a starting
guess, tuned from the ledger (§9).

**The loop.**

1. `/sweep` finds everything, ranks it, and fills `batch-<n>` up to 8 to 10
   items in all, counting items already labelled `batch-<n>` by other work; the
   rest wait as `sweep-queue`.
2. The owner answers on `/review-batch <n>`; `/review-batch <n> apply`
   applies the answers and opens the batch PR; `pnpm sweep verify` passes
   (§8); the owner merges.
3. `/sweep --continue` updates the graph incrementally, re-checks the topics
   the batch touched, the topics any other change since the baseline touched
   (`git diff <baseline>..origin/main`), and their neighbours, re-verifies every queued finding
   (dropping any whose quote no longer matches), ranks again, and fills
   `batch-<n+1>`.
4. It stops when a pass finds nothing new and the queue is empty or holds only
   `owner-deferred` items.

## 8. Between batches

### Fixing properly

1. **The fix covers the whole reach** listed on the card, not only the two
   sides that first clashed.
2. **Each resolved finding records its end state**: the winning text and its
   home, and what each losing place became (removed, rewritten, or a link).
3. **`pnpm sweep verify <batch>`** runs after apply, before merge:
   - **mechanically**: each losing quote is gone from every listed place and
     found nowhere else in the live set (the ledger, `docs/reviews/`, the
     archive, executed plans, decision and design-spec entries marked
     superseded, and closed decision beads superseded in part keep old text
     on purpose, S9); the winning text is at its home, and a home outside the
     live set (a closed bead, a review record) is read from bd or disk (S9);
     links resolve; `pnpm check` is green;
   - **by an agent**: the topics around the changes are re-checked for new
     contradictions the fix created.
   The batch PR is opened as a draft and marked ready only when both pass.
4. **Code drift waits for the code.** A finding where the code is wrong is
   *resolved in docs, code pending*; its bug bead's acceptance criteria
   include a test that pins the decided behaviour. `verify` skips its code
   side; a later run matches it as `pending`, not as new. When the bead
   closes, an event line in the ledger closes the finding.
5. **Gate.** `sweep/last-run` records the batch's PR, its `verify` result and,
   once merged, its merge commit. `/sweep --continue` refuses to start until
   `gh pr view` shows the PR merged and `verify` passed.

### Not mixing batches

1. **Anchors and fingerprint.** A finding's anchors are its stable IDs (B4,
   FEAT-R63, bead IDs) and its sides' refs without line numbers, with archived
   paths mapped back to where they lived. The fingerprint is the hash of that
   set: never the topic (topics are re-drawn every run) or the agent's wording.
   Shown with the `SW-` ID on the card, the bead and the ledger.
2. **Every new finding is matched against the ledger first:**
   - same fingerprint, resolved, losing text back: a **regression**, filed as
     a bug naming the batch that settled it, never asked again;
   - same fingerprint, code pending: **pending**, left alone;
   - anchors overlap but differ (two findings may share B4): a **candidate**;
     the lead judges whether it is the settled item, and says so on the card;
   - same fingerprint, owner answered "not a contradiction": suppressed,
     unless a side's text changed since;
   - new, sharing a topic with a settled item: a new card showing "related
     to SW-014, settled in batch 3".
3. **Settled items brief the checkers**: the resolved list goes into every
   checker's brief as "decided; this is the winner", so checkers report text
   that contradicts it and never reopen it.
4. **Baseline.** `sweep/last-run` records the last applied batch and its
   merged commit; every run starts from it.

## 9. The ledger

`docs/sweeps/ledger.jsonl`, in git, append-only, written through `pnpm sweep
ledger add` (schema-checked). Two kinds of line: a **finding** line at `apply`,
and an **event** line for what happens later (a pending finding closed by its
bead, a regression, a restored memory).

| Group | Fields |
|---|---|
| Finding | `SW-` ID, fingerprint, run, found date and commit, kind, topic, found by (sweep or escape), rank at the time |
| Each side | type (decision, product spec, design spec, plan, `CLAUDE.md`, skill, memory, bead, code, test), path or bead ID, line range, exact quote, stable ID |
| Each side's time and origin | written, last changed and approved dates; commit, PR, commit message; approved by the owner or not, and the evidence |
| Context | which side came first and by how long; reach; test coverage; suspected cause (code bug, spec revised without follow-through, plan-time change never written back, agent invention) |
| Prediction | predicted winner, the rule that predicted it, confidence |
| Owner | winner, or both wrong, or not a contradiction, or `auto` for truth-preserving items; note; batch; round; date |
| Resolution | end state (§8), commits and beads that applied it, and the queued findings that vanished after it |

**Learning.** Once about 30 contradictions are answered, `pnpm sweep ledger
report` shows how often each prediction matched the owner, by the pair of
side types, which came first, and whether each side was owner-approved; and whether rank
predicted impact (queued findings that vanished after a fix). The owner decides
from it which rules to keep, drop or automate.

## 10. The archive

**What moves** to `docs/archive/`, keeping its path under it (for example
`docs/archive/superpowers/plans/…`): executed plans, design specs whose plan is
fully executed, and research whose decisions are made. A plan and its spec
move together. Product specs, decision logs and `CLAUDE.md` files are homes
and never move. A design spec a `CLAUDE.md` or live doc cites as a
component's design (for example "backend spec §10.3") is not a candidate while
it is cited: `CLAUDE.md` files stay short (H5), so the spec stays live and is
swept. Decision logs stay live and are never rewritten (H6).

**How candidates are found.** `pnpm sweep archive --candidates` collects the
beads each file names (its `Beads`, `Bead`, `Epic` or `For` line, or through a
plan's `Spec` link) and asks `bd` whether they and their children are all
closed. All closed: a candidate. Files that name no bead are judged by the
topic's checker from the code and the beads, and marked *judged*, not
*computed*.

**The header rule.** Every live file in `docs/superpowers/specs/`,
`docs/superpowers/plans/` and `docs/research/` names its beads in its header
(new files with a `**Beads:**` line); `pnpm sweep lint` fails without it.
Product specs are homes and are not covered. Files that name no bead yet are
listed as exceptions in `tools/sweep/src/unlinked.json`; a new project seeds
that list empty, and from then on it only shrinks, so candidacy is purely
mechanical.

**Moving.** Surviving truth moves to its homes first. Then `pnpm sweep archive
<paths…>` runs `git mv`, rewrites every relative link across the repo, and
runs the link check.

**Frozen.** Archived files change only to fix links. Live docs may link into
the archive for why something was decided, never for what is true.

## 11. Memories

`bd` memories are loaded into every session by `bd prime`, so they reach every
agent, and are not in git, so no PR reviews them. H5 gives them one job:
workflow knowledge that cuts across components, kept tiny; anything about one
component goes to its `CLAUDE.md`. A new owner preference still lands there
first, so every session sees it at once. The sweep holds memories to H5: it
checks them first, since they are the newest and least-reviewed rules, and
raises **promote** for a memory that repeats a rule held elsewhere or belongs
to one component.

Several memories already restate repo rules: `plan-task-granularity` and
`interchangeable-decisions` repeat `docs/superpowers/plans/CLAUDE.md`, and
`pay-per-use` names three homes of its own (root `CLAUDE.md`,
`infra/CLAUDE.md` and A9). The first sweep will raise them.

Sweep state lives in `bd kv` under `sweep/last-run`. Memories are the
`memory.*` keys of the same store; `bd prime` loads only those.

## 12. `tools/sweep`

A workspace package like `tools/review-batch`: Node runs the TypeScript source,
zod schemas, vitest, `pnpm sweep <command>` from the root.

**First version**, what the first run needs:

| Command | What it does |
|---|---|
| `snapshot --run <dir>` | Beads and memories to linked markdown (§5 step 2) |
| `graph --run <dir>` | Graphify headless, cached by commit; writes `topics.json` |
| `rank --run <dir>` | Orders root causes (§7) |
| `timeline <side>` | A side's time and origin (§6) |
| `archive --candidates`, `archive <paths…>` | Candidates and moves (§10) |
| `lint` | Links resolve; live specs, plans and research carry `**Beads:**`; no `CLAUDE.md`, settings file or hook names `graphify` (§13). Part of `pnpm check` |
| `verify <batch>` | The mechanical half of §8 |
| `ledger add` | Schema-checked append |
| `recall plant`, `recall score` | Plant seeded contradictions in a copy of the live set; score a run's findings against them (§15) |
| `state get`, `state set` | `sweep/last-run` in `bd kv` |

`src/schema.ts` holds the contract between the workflow's agents, the lead,
the ledger and review-batch: finding, side, ledger line, topic.

**Later**, from what the first runs show: `ledger report`, and tuning `rank`.

**Tests** use small repos built in temporary folders: link rewriting after a
move, header parsing, blame parsing, ranking, fingerprint matching, schemas,
scoring. Nothing calls Graphify or a model; those are covered by recall (§15).

## 13. Graphify, contained

Coding agents never use Graphify in their normal work. It serves only the
sweep. H7 ("No graphify", for code navigation) stands; this narrows it with
one use the owner approved on 2026-09-30, recorded as a new decision that
cites H7 (H6: the log is never rewritten). H7's warning, that a graph repeats
stale docs as fact, is why the graph only routes: checkers and verifiers
read the original lines.

- Installed with `uv tool install graphifyy==<version>`, the version pinned exactly in `tools/sweep/CLAUDE.md` and chosen during the plan.
- Called only by `tools/sweep/src/graph.ts`:
  `graphify extract … --backend claude-cli`, output in
  `.superpowers/sweep/<run>/graph/`.
- `graphify install`, `graphify claude install` and Graphify's git hooks are
  never installed: they write a `CLAUDE.md` section and hooks that steer every
  agent to `graphify query` or rebuild on commit. The first run confirms
  `extract` installs none.
- `pnpm sweep lint` fails if any `CLAUDE.md`, `.claude/settings*.json`, git
  hook or Claude hook mentions `graphify`, except `tools/sweep/` and
  `.claude/skills/sweep/`.
- `tools/sweep/CLAUDE.md` says why.

## 14. Failures

| Failure | What happens |
|---|---|
| Graphify missing or fails | The run stops and names the install command. No silent fallback to full reading: it would change cost and recall unseen |
| A checker fails | The workflow resumes; only that topic reruns |
| A finding fails the schema | Dropped and logged in the run report, never filed half-formed |
| A quote no longer matches its `file:line` | The verifier drops it; stale queue items leave this way |
| `bd` or git stale, worktree dirty | Prepare pulls and fetches, and stops on a dirty worktree |
| `verify` fails | The batch PR is not ready; `--continue` is blocked |

## 15. Measuring it

| Measure | From | First target |
|---|---|---|
| Precision | Approved versus "not a contradiction" answers, at apply | 80% or more real |
| Recall | `recall plant` / `recall score` over about 10 seeded contradictions (a changed number, a changed role, an unmarked supersession, code drift, a duplicate, a conflicting memory), before the first real sweep and whenever briefs or routing change | 90% or more |
| Convergence | New findings per `--continue` in the topics just fixed | Falling to zero |
| Regressions | Regressions per batch | Zero; each one adds a case to `verify` |
| Escapes | Beads labelled `sweep-escape`; each becomes a seeded case | Falling |
| Owner time | Cards and the owner's minutes per batch, on the batch bead | At or under the cap |
| Cost | Tokens per run, full and `--continue` | Recorded; judged after a few runs |

Before the first real sweep, recall runs twice: routed by Graphify and by full
reading. Graphify stays only if it matches full reading's recall for less.

## 16. Changes to existing files

- **Root `CLAUDE.md`**, under *Conventions & Patterns*, outside the managed
  Beads block: what memories hold (H5, §11); "link to a rule's home instead of
  restating it"; "`docs/archive/` is history, never a source of rules".
- **`docs/superpowers/plans/CLAUDE.md`** and **`docs/superpowers/specs/CLAUDE.md`**:
  the `**Beads:**` header rule (§10), in the same change that turns on its
  lint.
- **`docs/decisions/2026-09-25-harness-decisions.md`**: nothing rewritten
  (H6). The new decision narrowing H7 lives in
  `docs/decisions/2026-09-30-sweep-decisions.md` and cites H7; H7's row in the
  status table (current state) points to it.
- **`review-batch` skill**: a `sweep` kind for beads labelled `sweep`, whose
  card carries the winner call (§6) and whose Later goes to `sweep-queue`; at
  apply, open the PR as a draft, run `pnpm sweep ledger add` and `pnpm sweep
  verify`, list the truth-preserving changes in the PR, and mark it ready when
  verify passes.
- **`.gitignore`**: `.superpowers/` (today only in the local
  `.git/info/exclude`).
- **Root `package.json`**: the `sweep` script.

## 17. Relation to recorded decisions

- **H5** (where knowledge lives): the canonical homes follow it (§2, §11).
- **H6** (superseding a decision): unmarked supersessions are fixed with its
  protocol (§6). The planned `/decide` skill prevents
  untraced reversals when a decision is made; the sweep finds the traces
  that got through. They complement each other; neither replaces the other.
- **H7** (no Graphify for code navigation): narrowed, not reversed (§13).
- The harness decisions' *Deliberately not doing* table deferred a
  doc-gardening routine until "docs start drifting from code". This sweep is
  that routine, started by hand.

## 18. Not in this version

- Automating any class of contradiction (needs the ledger's evidence, §9).
- `ledger report` and rank tuning.
- Scheduled sweeps; a sweep is started by hand.
- Competitor profiles.
