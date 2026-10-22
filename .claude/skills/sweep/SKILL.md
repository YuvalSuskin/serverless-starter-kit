---
name: sweep
description: Use when the owner types /sweep or /sweep --continue, or asks to run, start or continue a consistency sweep, find contradictions across the repo's docs, beads, memories and code, or bring the repo to one source of truth. Finds contradictions, ranks them, and files the top ones as review-batch items; never changes the truth itself.
---

# Consistency sweep

You are the **sweep lead**. A sweep finds where the repo contradicts itself
(decisions, product specs, design specs, plans, `CLAUDE.md` files, skills,
`bd` memories, beads, code), ranks what it finds, and files the most important
root causes as items for the owner's next review batch. It never edits a live
file, a bead's text or a memory: resolutions go through `/review-batch`.

Design, with its reasons: `docs/superpowers/specs/2026-09-30-sweep-design.md`.
Briefs next to this file: `checker.md`, `verifier.md`. The deterministic steps
are `pnpm sweep <command>` (`tools/sweep/CLAUDE.md` lists them). Graphify is
called only by `pnpm sweep graph`; never run a `graphify` command yourself.

## Commands

| Command | What you do |
| --- | --- |
| `/sweep` | A full sweep (*Running a sweep*, mode `full`) |
| `/sweep --continue` | After a batch was applied and merged: the gate, then a sweep scoped to what changed (mode `continue`) |

Typing `/sweep` is the owner's opt-in to the saved workflow `sweep`
(`.claude/workflows/sweep.js`): call it with the Workflow tool as step 6 says.

## Where things live

| What | Where |
| --- | --- |
| A run's files | `.superpowers/sweep/<date>-<n>/` (git-ignored): `snapshot/`, `topics.json`, `topics-named.json`, `drafts.json`, `matched.json`, `to-file.json`, `rank.json`, `state.json`, `report.md` |
| The graph cache | `.superpowers/sweep/cache/` (lasting between runs) |
| The baseline | `bd kv` key `sweep/last-run` (`pnpm sweep state get` / `set`) |
| Settled contradictions | `docs/sweeps/ledger.jsonl`, in git (`pnpm sweep ledger add`) |
| A run's beads | an epic "Sweep <date>" labelled `sweep`; one child per root cause, labelled `sweep` and `batch-<n>` or `sweep-queue` |
| A root cause's findings | its bead's design field, as JSON (below) |

## Running a sweep

`pnpm sweep state set` and `pnpm sweep ledger add` take a whole JSON file:
read the current state with `pnpm -s sweep state get`, change the fields,
write `<run>/state.json` and pass it; write each ledger line to its own file.
Use `pnpm -s` whenever you redirect output: pnpm's banner would break the JSON.

1. **Prepare.** `bd dolt pull`; `git fetch origin main`. **In both modes,
   check the last batch first** (`pnpm -s sweep state get`): if it names a
   `batch` whose PR is not yet merged (`gh pr view <pr> --json state`), stop:
   "batch <n>'s PR is not merged: its settled items are not on main yet, and a
   sweep now would ask them again". If it names a `batch` with no `pr`, look at
   the batch's owner bead: when that batch was applied with no sweep item left
   to merge (all deferred, rejected or not a contradiction), clear `batch` in
   the state and go on; otherwise stop as above. Work on
   `origin/main`: if this checkout is dirty or not at `origin/main`, stop and
   say so (the owner decides whether to clean it or run from a fresh
   worktree). Make the run folder `.superpowers/sweep/<YYYY-MM-DD>-<n>/`.
   **The batch number `<n>`**: the highest `batch-<k>` label any bead carries
   (`bd list --all --json --limit 0`); if batch k's owner bead ("Owner: answer
   review batch k", label `review-batch`) is closed or its page was submitted,
   use k+1, else k: the sweep's items join the batch still being prepared.
2. **Gate (`--continue` only).** `pnpm -s sweep state get`. No state, or a
   state with an empty `commit` (a first run that stopped): stop, "no sweep
   has completed; type /sweep". State with a `batch`: `gh pr view <pr>
   --json state,mergeCommit`; continue only if the PR is `MERGED` and `verify`
   is `passed`, otherwise stop and say what is missing; write the merge commit
   into `mergedCommit`. The **baseline** for what changed is `mergedCommit`, or
   `commit` when no batch was filed. Then close what was fixed since: for
   each ledger finding line with `codePending: true` and no `closed` event
   whose bug bead (`resolution.beads`) is closed, and for each `regression`
   event with no later `closed` event whose `bead` is closed, add the event
   line `{ "event": "closed", "id": "SW-…", "date": "<today>", "bead": "<id>", "note": "" }`.
   **Ledger events go through a pull request**: write them on a branch
   `sweep/<run>-ledger` from `origin/main`, commit, push, and open a PR
   ("Sweep <date>: ledger events"); the owner merges it with the batch's.
3. **Snapshot.** `pnpm sweep snapshot --run <run>`.
4. **Graph.** `pnpm sweep graph --run <run>`. If it stops (Graphify missing,
   files unfinished), report that and stop: no silent fallback to reading
   everything. Keep its `Graphify tokens:` line for the report (none when the
   graph was reused).
5. **Topics.** Read `<run>/topics.json` (one per Graphify community). Merge
   and name them into 5 to 8 topics a person would recognise ("Uploads and
   limits", "How agents work"), keeping every file in some topic; a named
   topic's `neighbours` are the other named topics its communities linked to.
   For `--continue`, the **changed places** are: the batch's own changes
   (`git diff --name-only <commit>..<mergedCommit>`), every change since
   (`git diff --name-only <mergedCommit>..origin/main`), and every
   `bead:`/`memory:` ref the batch's ledger lines name (their `sides` and
   `endState`); keep only topics holding a changed place, and their
   neighbours. Write them to `<run>/topics-named.json`.
6. **Check and verify.** Collect the queue: every open bead labelled
   `sweep-queue`, each finding in its design field's `findings`, in a fixed
   order (remember each one's `SW-` ID, fingerprint and bead). Call the Workflow
   tool with `name: "sweep"` and `args: { root, runDir, topics, mode, queued, changed }`
   (`root`: this checkout's absolute path; `topics`: the names of the topics
   in `<run>/topics-named.json`, never the topics themselves, since each
   checker reads its own from there; `queued`: those findings without `id`
   and `fingerprint`; `changed`: the changed places, for `--continue`).
   **If its `failed` is not empty, the run is partial**: resume it (Workflow with `resumeFromRunId`) or stop; never
   go on with a partial run. Write its `findings` to `<run>/drafts.json` and
   its `dropped` list to the report. Map `requeued` back by position: a
   survivor gets its ID and fingerprint back and joins step 9; a `null` is
   stale. Close a queued bead (`bd close <id> --reason "Stale: its text is
   gone"`) only when all its findings are stale; otherwise rewrite its design
   with the survivors.
7. **Archive candidates.** `pnpm -s sweep archive --candidates --json`. For
   each `candidate` group, add one finding to `drafts.json`: kind `archive`,
   sides one per file (quote its title line), `rootCause`
   `archive-<first file's name>`, `proposedFix` "Move to docs/archive/ with
   `pnpm sweep archive`; first move <what is still unhomed> to its home" or
   "Move to docs/archive/; everything true is already homed".
8. **Match.** `pnpm -s sweep match <run>/drafts.json --run <run> > <run>/matched.json`.
   It gives every finding an `SW-` ID and a fingerprint (the IDs are spent)
   and matches it to the ledger; findings that fail the schema are dropped on
   stderr: copy those lines into the report. Route each by its match, and
   write the ones going on (with the queue survivors) to `<run>/to-file.json`
   in the same shape:
   - `new`: goes on.
   - `related`: goes on; its card says "related to SW-… settled in batch n".
   - `filed`: an open sweep bead (`bead`), or an earlier finding of this run,
     already holds it: not filed again; listed in the report.
   - `candidate` with a `bead`: an open sweep bead holds a finding sharing
     its stable ID or places. The same item: `filed` (merge any new side into
     that bead's design). A different item: goes on as new.
   - `candidate` without a `bead`: read the settled line it names. If it is a different item,
     it goes on as new. If it is the same item (same claim, same places):
     losing text back is a `regression`; a pending code fix is `pending`; an
     owner's "not a contradiction" with its texts unchanged is `suppressed`;
     otherwise (the losing text is gone, it was seen again) it is not filed,
     and listed in the report. Say which in the report.
   - `pending`, `suppressed`: not filed; listed in the report.
   - `regression`: a bug bead, "Regression of SW-… (settled in batch n)",
     labelled `sweep` and `sweep-regression`, with the settled winner and the
     text that came back, and its design field `{ "findings": [<this
     finding>] }` (so the next run sees it as `filed`); and an event line
     `{ "event": "regression", "id": "<the settled SW-…>", "bead": "<the bug>", … }`
     on the ledger-events branch (step 2). Never a card.
9. **Rank.** `pnpm -s sweep rank --run <run> > <run>/rank.json` (it reads
   `to-file.json`, grouped by `rootCause`, and `topics.json`).
10. **File.** An epic "Sweep <date>" (`bd create --type epic`, label
    `sweep`). Under it, one bead per root cause in rank order, title
    "Sweep: <claim>", labels `sweep` and `review`, and:
    - `batch-<n>` for the top root causes, up to 8 to 10 items in batch n
      **counting items already labelled `batch-<n>`** by other work
      (`bd list --label batch-<n> --status open,in_progress --json`);
      truth-preserving root causes also carry `batch-<n>` but do not count;
    - `sweep-queue` for the rest. A queue survivor that now ranks into the
      batch swaps `sweep-queue` for `batch-<n>`, unless it is labelled
      `owner-deferred` (the owner put it off: it stays queued).
    A root cause an open sweep bead already holds (queue survivors, `filed`
    matches) keeps that bead: relabel it, never create a second one.
    Its design field (`--design-file`) is JSON:
    `{ "findings": [<its findings>], "match": { "<SW-id>": <match> }, "rank": <its rank line>, "timelines": { "<SW-id>": [<Origin per side>] }, "truthChanging": <bool>, "found": { "run": "<run folder name>", "date": "<today>", "commit": "<origin/main>" }, "runDir": "<run folder path>" }`
    (review-batch adds `draftedFor` and `winners` when it drafts the card).
    Get each side's origin with `pnpm -s sweep timeline --side '<side json>'`.
    Truth-changing kinds: `conflict`, `code-drift`, `unrecorded-decision`, and
    `promote` or `archive` that write new text into git.
11. **Record.** State: `commit` (origin/main's), `date`, `batch: <n>` (or
    `null` if nothing was filed on it), `pr: null`, `verify: null`,
    `mergedCommit: null`, `graphKey` (the content of
    `.superpowers/sweep/cache/graph/key`), and the `nextId` that `match` left.
12. **Report.** Write `<run>/report.md`: mode, topics, the Graphify token
    line, counts (findings by kind; filed on the batch, queued; regressions;
    pending; suppressed; candidates and how you judged them; dropped by the
    verifiers and by the schema, with reasons; stale queued), and the batch's
    items. Post it on the epic (`bd comments add <epic> -f <run>/report.md`).
    Tell the owner, in a few lines: how many items wait on
    `/review-batch <n>`, and anything that stopped you.

## After the owner's batch

`/review-batch <n> apply` applies the answers (its *Sweep items* section says
how): it records each finding in the ledger, opens the batch PR as a draft,
runs `pnpm sweep verify <n>` and this workflow in mode `verify` over the
topics the batch touched, writes `pr` and `verify` into `sweep/last-run`, and
marks the PR ready when both pass. When the PR is merged, the owner types
`/sweep --continue`.

## Done

The sweep has converged (spec §7) when a `--continue` finds nothing new and
the queue is empty or holds only `owner-deferred` items. Say so in the report.

## Stops

Stop and say why, filing nothing, when: the checkout is dirty or not at
`origin/main`; the gate fails; `pnpm sweep graph` stops; the workflow returns
nothing for every topic, or reports `failed` topics or verifiers you could not
resume. A partial run is never filed.
