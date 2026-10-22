# CI runner minutes: decisions

**Date:** 2026-10-06

GitHub Actions is billed for a private repo. The owner asked to run the main
checks before a push, and to cut the minutes CI spends. This file records the
choices and the reasons. Each choice is technical, with nothing a user would
notice. The merge gate still needs the same checks on every code change; only
where they run and when an unneeded job starts has changed.

The figures in the "Why" column (billed minutes, failed runs) are from the
project the template was taken from. They justify a choice and are not this
project's numbers; measure again before changing one.

## Choices

| #   | Choice | Why |
| --- | ------ | --- |
| CI1 | A **pre-push hook** runs `pnpm check:push`: format, lint, typecheck and knip for the affected packages (in parallel), their unit tests (one package at a time, as CI's `test` job does), then `pnpm sweep lint`. "Affected" is measured against `git merge-base HEAD origin/main`, as CI measures against the PR's base. Not run: the backend's contract tests (Docker), the bundle tests, e2e; CI runs those | verify and test failures were 28 of the failing jobs, each costing a whole run and the run after the fix. Turbo's cache replays what `pnpm check` already passed, so after a green `pnpm check` the hook takes seconds; cold, about 2.5 minutes on the owner's laptop. Unit tests run serially because Vitest's browser projects flaked under a fully parallel run (seen while building this) |
| CI2 | The hook lives in the repo's existing hooks folder, **`.beads/hooks/pre-push`**, in its own marked block outside beads' markers, before the beads sync. `pnpm install` (a root `prepare` script) points `core.hooksPath` at `.beads/hooks` only when it is unset, and never in CI. No hook manager (husky, simple-git-hooks, lefthook) | git takes one hooks folder, and this repo's is already `.beads/hooks` (`bd hooks install --beads`); a hook manager would take `core.hooksPath` from beads or write to `.git/hooks`, which git ignores while it is set. `bd hooks install` keeps content outside its markers. No new dependency |
| CI3 | *Superseded by CI17 (2026-10-16): ci.yml has one job, `proof`, and runs no check.* One **`changes` job** asks `turbo ls --affected` once and hands `frontend`, `opennext` and `preview` to the jobs that need them; a job not needed is **skipped before it starts** | a skipped job costs nothing; each job used to start, install and ask for itself. Keeps B9's graph-driven selection (no hand-kept path lists); the package lists are the same as before. A failed `turbo ls` fails the `changes` job (pipefail), so it can never skip jobs silently |
| CI4 | *Superseded by CI17 (2026-10-16): GitHub runs no e2e; `pnpm check:full` runs every project on both builds, and the `proof` job requires it.* **Three e2e jobs instead of seven**, grouped by engine: drafts build on Chromium (desktop and Android), drafts build on WebKit (iPhone), production build on all three projects | every project still runs on both builds; seven jobs paid the start-up and the build seven times. About 17 billed minutes instead of 27, the longest job about 7 minutes instead of about 5. A re-run of a failed job now repeats a larger job |
| CI5 | *Superseded by CI17 (2026-10-16): docs.yml is gone; its three checks run in `pnpm check:full`.* **docs.yml is one job** with one install and three checks, each run even when one before it failed | each check takes seconds; as three jobs each was billed a minute |
| CI6 | *CI17 (2026-10-16): a Dependabot PR needs the proof too; the orchestrator runs `pnpm check:full --ready` on its head (CI17).* **Dependabot**: at most 3 npm PRs open (was 10), and **no automatic rebase** (`rebase-strategy: disabled`). Whoever merges one comments `@dependabot rebase` first, then the merge gate applies as usual | every rebase re-ran the full CI (the lockfile affects every package): 31 runs, 30% of the minutes, on PRs nobody was merging yet. Security updates are not held by the limit |
| CI7 | *Superseded by CI17 (2026-10-16): a push to `main` runs nothing.* **Kept as they were**: cancelling superseded runs (`concurrency`), the caches (pnpm store, Playwright browsers, Next's cache, turbo's cache for verify and test), and the full run on every push to `main` | already in place; see the options below for the push to `main` |
| CI8 | *Superseded by CI17 (2026-10-16): a push to `main` runs nothing; dev is deployed from the Mac after merges, and `deploy-dev.yml` is a manual fallback.* (2026-10-07) **A run on `main` is no longer cancelled** by a newer push (`cancel-in-progress` for pull requests only); the newer one waits, and GitHub keeps one waiting run per group. **`deploy-dev`** runs last on `main`, only when the push changed something deployed (`changes` gains `deploy`): about 5 billed minutes a deploy (measured). On `main`, verify, test and `changes` measure "affected" from the commit dev last deployed, not the previous push | a `main` run may be deploying `dev`, and a deploy killed midway leaves SST's lock and possibly pending operations. Costs the minutes of a `main` run that used to be cancelled (pushes within one run's length); a push that changes nothing deployed adds nothing (deploy pipeline) |

## Options not taken

- **Skip the push-to-`main` run when its tree equals a PR head that passed**
  (534 minutes, 15%). Not now: it is the safety net after a merge, and its
  caches are the ones every PR restores (caches saved on a PR branch are
  visible only to that PR), so PRs would start cold. (Taken on 2026-10-08
  as CI14, with main still saving Next's cache.)
- **Run some e2e projects only when some of the app's files change.** It
  drops a check the merge gate relies on for every other change.
- **One e2e job for everything**: about 14 minutes billed, but about 11 of
  waiting. Merging the production run into the drafts jobs saves one more
  minute for two builds per job; not worth the complexity.
- **Merge verify and test**: Vitest's browser projects fail to start on a
  saturated 2-core runner (ci.yml's comment).
- **Playwright's Docker image** to skip `playwright install-deps` (20 to 40
  seconds a job): pulling the image costs about as much.
- **Larger runners**: a 4-core runner bills twice the rate per minute.

## 2026-10-08: local first

The Actions budget ran out within days, and the owner asked to enforce running
the tests locally before pushing.

### Choices

| #    | Choice | Why |
| ---- | ------ | --- |
| CI9  | *Superseded in part by CI15 (2026-10-14) and CI17 (2026-10-16): the proof is now the gate itself, not the key to CI's heavy jobs, and the `local-check-waived` label is gone.* **Proof before CI's heavy jobs.** `pnpm check:full` (tools/local-check) runs `check:push`'s suites, the contract and bundle tests, `pnpm competitors check`, and e2e on both builds when the frontend is affected, on a clean commit; it then posts a commit status, `local/check-full`, on it. On a ready PR (not Dependabot's), ci.yml's `changes` job first looks for that status on the head (`.github/scripts/local-proof.sh`, up to 90 seconds) and fails without it; **every other job now waits for `changes`**, so nothing else starts. Posting the proof re-runs a run that stopped there. The PR label `local-check-waived` lets CI run without it | 10 of the 16 failed runs were suites that pass or fail the same here, and each failure cost a run (about 30 minutes) and the fix's run. A missing proof costs about two minutes instead of thirty. The proof names the exact commit, and a commit names its tree, so it cannot be stale. verify and test waiting for `changes` adds about 40 seconds of wall time and no minutes |
| CI10 | **A draft PR runs nothing** (ci.yml and docs.yml). Agents open PRs as drafts and mark them ready with `pnpm check:full --ready`, which posts the proof first | before a PR is ready an agent pushes for safety and review; those pushes cost 1.64 full runs per PR. The fast checks still run on each push, in the hook. The merge gate is unchanged: a ready PR runs every check, on every head |
| CI11 | **The hook runs `pnpm check:full` itself on a push to a ready PR**, unless that commit already passed it; then a background process posts the proof once the push lands. What `check:push` runs moved from the root script into tools/local-check, which the hook calls | a push to a ready PR starts the heavy jobs, so that is where running them locally pays. The hook file every worktree runs is the main checkout's (see above), so its logic has to ship with the branch, not with the hook |
| CI12 | *Superseded in part by CI17 (2026-10-16): nothing is left to CI; the OpenNext build and the preview smoke run in `pnpm check:full`, and a machine without WebKit cannot make a proof the `proof` job accepts for a frontend change.* **One heavy suite at a time per machine.** Contract, bundle and e2e suites hold a lock in the shared git data; a second worktree waits, saying for whom. Unit tests one package at a time (no Vitest cap: turbo would hash it and stop replaying `pnpm check`), Playwright at 3 workers, e2e on its own ports, one retry and `--forbid-only` as in CI. Left to CI: `opennext-build`, `preview-smoke`, and the iphone project on macOS below 15 | parallel agents loaded the laptop to 80 to 136, where Vitest's browser projects flake, and two e2e runs would meet on fixed ports. Queued, each runs at full speed; a suite dies with local-check, and a lock held over two hours is broken. |
| CI13 | *CI17 (2026-10-16): "every check on that head" is now the `local/check-full` status and the `proof` job, both required by main's branch rule.* *CI18 (2026-10-19): `pnpm merge-gate <pr>` applies it; a head behind main may also merge when the checks across packages pass on the merge result.* **The merge gate stays as it is**: a PR merges when its head contains `main` and every check on that head passed. The merge of `main` is a commit like any other: `check:full` before pushing it (the hook insists), so it fails here, not in CI. Merge locally, never with "Update branch" (its commit has no proof) | 1 of 22 merge runs failed from the merge itself, so the re-run is not waste; local first makes it cheaper without dropping it |
| —    | **Not built, for the owner**: skip re-running checks on `main` when the merged tree is the PR head that passed. 679 minutes (20%), about 25 per PR. *Approved 2026-10-08: CI14 below* | it reverses CI7 |

### Options not taken

- **The pre-push hook runs e2e on every push.** An agent pushes often, and
  a push before the PR is ready starts no heavy job now (CI10); e2e there
  would cost ten minutes of the laptop for nothing CI would have run.
- **Trust the local proof in place of CI's e2e** (about 45 minutes per
  PR). The merge gate would then rest on e2e run on macOS, without WebKit
  here; that changes the owner's rule. Rejected at first.
  *Taken on 2026-10-14 as CI15, for exactly the projects the proof ran.*
- **Re-run only what a merge of `main` could affect.** See CI13.
- **GitHub's merge queue**: only for repositories owned by an organisation.
- **A self-hosted runner**: the owner scrapped it on 2026-10-07.
- **Two Playwright workers on CI's 2-core runner**: might cut e2e by a
  third, or bring back the flakes one worker was chosen to avoid; not
  measured, so not changed.

## 2026-10-08: main skips a tree CI already checked

**Decided:** 2026-10-08, Yuval Suskin, on the inbox page. Reverses CI7's full run on `main` for this one case.

| #    | Choice | Why |
| ---- | ------ | --- |
| CI14 | *Superseded by CI17 (2026-10-16): a push to `main` runs nothing at all; `same-tree.ts`, `next-cache` and `deployed-base.sh` are gone.* **A push to `main` skips verify, test, the e2e jobs, opennext-build and preview-smoke when CI already checked its tree**: a PR into `main` was merged as this commit, the commit's tree is that PR head's tree, the newest ci.yml run on that head from that PR's branch passed, and the ci.yml run on `main` before this one passed. The `changes` job asks (step "Same tree as a PR head that passed", `tools/local-check/src/same-tree.ts`) and says `same_tree`; anything else, a GitHub error included, runs everything, as before. **`deploy-dev` still runs** when something deployed changed, and **`next-cache`** saves Next's build cache on `main` when the frontend changed and `main` does not hold that key yet | when the merge gate held (the head contained `main`, and `main` did not move before the merge), the squash merge's tree is the head's, which CI checked in full minutes earlier; the re-run could catch only a flaky test or a runner image change. About 25 billed minutes per merged PR (20% of the measured bill); the run on `main` drops from 29 to the `changes` job, `next-cache` (about 3 when the frontend changed) and the deploy. The previous run on `main` must have passed because `main` measures "affected" from dev's last deploy (CI8) while a PR measures from its base: after a red `main`, the full run is what keeps code whose checks failed there from deploying. Caches: the PR saves turbo's, the pnpm store and Playwright's under its own branch, so the next PRs restore `main`'s older entries until a full run on `main` refreshes them (`deploy-dev` still saves the pnpm store); Next's, the one that costs a build, `next-cache` keeps current |

## 2026-10-14: CI does not repeat the e2e the proof ran

**Decided:** 2026-10-14, owner. Reverses, in part, the
choice not to trust the local proof in place of CI's e2e (see "Options not
taken" under 2026-10-08), now that the owner's Mac runs every project: it is
on macOS 27, so WebKit and the iphone project run locally
(`tools/local-check/src/plan.ts`, `runsWebKit`).

`pnpm check:full` had already run those same projects on both builds, with the same flags CI uses (one retry, `--forbid-only`).

| #    | Choice | Why |
| ---- | ------ | --- |
| CI15 | *Superseded in part by CI17 (2026-10-16): there is no frontend-build; the same reading of the proof now decides whether the `proof` job passes (every project on both builds when the frontend is affected).* **On a pull request, frontend-build runs only the e2e projects the proof on the head did not run, on the builds it did not run them.** `pnpm check:full` records, per build, the projects that passed, and its status description begins with them: `[e2e drafts:chromium,android,iphone production:chromium,android,iphone] passed in 12m34s: ...` (`[e2e none]` when the frontend was not affected; a record from before CI15 says nothing). The `changes` job's step "Local check proof" passes the description on, and its step "E2E the proof did not cover" (`tools/local-check/src/e2e-matrix.ts`) removes from the matrix each project the description names for a build, drops a job with no project left, and narrows one with some left (the engines to install follow the projects). `frontend-build` is skipped when nothing is left (`e2e_run == 'false'`); an empty output runs it, with the full matrix as the fallback in the workflow. **Fail safe:** no proof, a proof for another commit (the status is looked up on the exact head), a proof labelled waived, an unreadable description, any other event, or a failed step runs the full matrix. A push to `main` reads no proof: the same-tree skip (CI14) or the full run, as before | the projects ran here under the same flags on the same commit, and the head names the whole tree; running them again could catch only a flaky test or a difference between this machine and the runner. The production build's budgets, minimal-home and smoke specs are specs of the `chromium`, `android` and `iphone` projects, not separate steps, so the proof covers them exactly when it covers those projects on the production build. The only check that is CI's alone is the iphone project on a machine without WebKit (macOS below 15), which the matrix then keeps |

## 2026-10-14: local checks run on CI's Node

**Decided:** 2026-10-14, a technical choice; nothing a user would notice. It
tightens CI15, which trusts what this machine ran.

A test failed in CI with `sessionStorage is not defined`, while `pnpm check`
and `pnpm check:full` had passed on the owner's Mac. The Mac ran a newer Node
that has a global `sessionStorage`; the repo (`.nvmrc`, `engines`) and CI run
Node 24, which does not. Nothing compared the two, and since CI15 a proof from
a different Node also stood in for CI's e2e.

| #    | Choice | Why |
| ---- | ------ | --- |
| CI16 | *CI17 (2026-10-16): the `proof` job requires the major on every proof, so a proof without e2e names it too (`[e2e none node24]`).* **`.nvmrc` is the one Node pin, and local-check holds this machine to its major** (`tools/local-check/src/node-pin.ts`). `pnpm check:full` refuses to start on another major, running and recording nothing, and says how to switch (`pnpm env use --global 24`, or `nvm use`); so does the full run a ready PR's push starts. `pnpm check:push` only warns, then runs its fast suites. The pass record and the proof's description carry the Node major inside the e2e token: `[e2e drafts:chromium,android,iphone production:chromium,android,iphone node24] passed in ...`. The `changes` job's step "E2E the proof did not cover" reads CI's major from `.nvmrc` (the file every `setup-node` in ci.yml reads) and trusts a proof's e2e only when it names the same major; a proof naming another, none (a proof from before CI16), or a pin it cannot read runs the full matrix | the failure was a machine on a newer Node passing what CI's Node fails. A refusal stops it at the source; the label in the proof stops a proof that slipped through (or an older one) from replacing CI's e2e. Warning, not refusing, in `check:push`: its suites are what CI repeats anyway, so a wrong-Node pass costs one CI run, whereas a proof makes CI skip work. `repo.test.ts` pins that every `setup-node` reads `.nvmrc` and that `engines` names its major |

Not taken: reading the major from `engines` or from `process.version` in CI
(two homes, which can disagree); refusing `check:push` as well (it would block
a push for a mismatch the fast suites cannot hide from CI); a bypass variable
(the proof would then claim a Node it did not run on).

## 2026-10-16: the local proof is the gate

**Decided:** 2026-10-16, owner. Actions billing kept
blocking merges, so GitHub runs almost nothing: the proof `pnpm check:full`
posts is the gate. In the owner's words: "we need something to enforce that
check in github. That the CI was uploaded." The owner upgraded to GitHub Pro
for a branch rule on `main` that requires it. Supersedes CI3, CI4, CI5, CI7,
CI8 and CI14; in part CI9, CI12 and CI15; adds to CI6, CI13 and CI16 (each row
says how).

| #    | Choice | Why |
| ---- | ------ | --- |
| CI17 | *In this template there is one e2e build, so "both builds" reads "the build" (TB43).* **`ci.yml` is one job, `proof`**, on every ready pull request (no paths filter: a docs-only PR needs its proof too), about 20 seconds. It passes only when the PR's head carries the `local/check-full` status in state success (`.github/scripts/local-proof.sh`, which waits up to 45 seconds for the pre-push hook's background post, none for Dependabot), the proof names the repo's Node major (`.nvmrc`, CI16), and, when turbo says the change affects the frontend (measured from the main that GitHub's merge commit for the PR was built on, its first parent), the proof ran every e2e project on both builds (step "Proof covers the change", `tools/local-check/src/e2e-matrix.ts`'s `proofScope`, CI15's reading of the description). Anything unreadable fails. **main's branch rule requires `local/check-full` and `proof`.** **No other job runs on a pull request**: verify, test, the e2e jobs, opennext-build and preview-smoke are gone, and `docs.yml` with them. What only they checked moved into `pnpm check:full`: the OpenNext build (when the frontend or deploy is affected, D4's guardrail), the preview smoke test (when preview, the frontend or the backend is affected; it stops only a preview it started), and `backend/CLAUDE.md`'s truth test (on every change, as docs.yml ran it); docs.yml's other two checks, the sweep lint and `pnpm competitors check`, already ran there. **A push to `main` runs nothing.** Dev is deployed from the orchestrator's Mac after merges (`sst diff`, `diff-guard`, `sst deploy`, `smoke`; runbook, "The deploy pipeline"); `deploy-dev.yml` runs the same steps on GitHub when started by hand on `main`, as a fallback. No scheduled workflow exists, so none was kept. **Dependabot's PRs** have no machine that pushed them: the orchestrator comments `@dependabot rebase` when the PR is behind `main`, checks the head out (`gh pr checkout <n>`), runs `pnpm check:full --ready` on Node 24, which posts the proof on that commit (a commit status needs write access to the repo, not authorship of the commit) and re-runs the failed `proof` job, then merges. The `local-check-waived` label is gone: the branch rule needs the status itself, and any exception is the owner's, in that rule. On a draft the job is skipped, which GitHub counts as a pass, so merge only once the `proof` run that marking the PR ready starts has passed | GitHub's runners repeated, for minutes a run, what had already passed on the owner's Mac under the same flags, and the bill stopped merges. The Mac runs every project (macOS 27, WebKit included), on the repo's Node (CI16), on the exact commit, whose hash names its whole tree. The `proof` job is what makes the proof enforceable: a status alone says nothing about scope, so the job checks the Node and, for a frontend change, that no e2e project was skipped. It cannot check that a hand-posted status is honest: anyone with write access can post one, as anyone with write access could always merge. What is lost: a clean runner (Linux, a fresh install) catching what only this Mac's state hides, and the safety net of a run on `main` after the merge. The merge gate's rule that the head contains `main` (CI13) keeps the merged tree the proven one; *CI18 (2026-10-19): or, when main moved, `pnpm merge-gate` checks the merged tree's packages that both sides affect* |

## 2026-10-19: the merge gate checks the merge

**Decided:** 2026-10-19, technical (the owner asked how to prevent a repeat).
Two pull requests were each proven, touched no file in common, and merged one
after the other: the first added required fields to a type, the second's new
test fixture lacked them, so main no longer type-checked and the dev deploy's
build broke. The orchestrator's gate let it through: "the head contains
`origin/main`, or no file overlaps". That gate lived only in the orchestrator's
instructions; it is now a tool.
Adds to CI13 and CI17 (each row says how).

| #    | Choice | Why |
| ---- | ------ | --- |
| CI18 | **`pnpm merge-gate <pr>` is the merge gate** (`tools/local-check/src/merge-gate.ts`). The orchestrator merges only on its PASS, with the command it prints: `gh pr merge <pr> --squash --match-head-commit <head>`. It blocks a PR that is a draft, not open or not into `main`; a head where a check is not SUCCESS or SKIPPED, or where `local/check-full` or a passed `proof` job is missing (a `proof` skipped on the draft does not count); a PR GitHub says conflicts; a head that moved while it ran. Then **a head that contains `origin/main` passes at once**: the squash's tree is the tree the proof names. **Otherwise it checks the merge result**: `git merge-tree` makes the tree GitHub's squash would (a conflict blocks), a local commit of it is checked out in a throwaway worktree (`<main checkout>/.claude/worktrees/merge-gate-pr<n>`, removed when it ends, fails or is killed, and first if a killed run left one; so one run per PR at a time), `pnpm install --frozen-lockfile --prefer-offline`, then the packages each side affects, measured from their merge base (to the PR's head, to main): turbo's affected packages, plus those whose tasks read a file the side changed outside their folder (turbo.json's `$TURBO_ROOT$` inputs: the backend's tests read `docs/`, sweep's every `.md`, competitors' the product specs; and the root's own format task), and on **the packages both sides affect**: format, lint, types, knip and the unit and browser tests (`check:push`'s suites; the tests under the machine-wide lock; the newest run of each check is the one read, as the branch rule reads them), then the sweep lint and `backend/CLAUDE.md`'s truth test, which read the whole repo. A failure blocks, naming the suite. It never merges, pushes, posts a status or marks a PR ready. **No common file is no longer a reason to merge a PR behind main unchecked** | Replayed through the gate (the second pull request's head onto main just after the first), it blocked in 34 seconds, on that fixture's type error. Only a package both sides affect can break in the merge: a package one side affects (its dependencies included, as turbo's dependents are) has the same files and dependencies in the merge as on that side, where they passed (the PR's proof, or main, kept green by this gate). The two repo-wide checks cover what turbo places in no package (docs, which they read). The sides are measured in the merge result, so a package one side adds is in its graph. A merge that passes, measured on a real pull request's head onto the main it merged into (one commit behind; the backend, deploy and frontend affected by both): install 9 seconds, format, lint, types and knip 1.5 minutes, the unit and browser tests 2.5 minutes, so about 4 minutes of work plus any wait for the machine-wide lock; a head that contains main costs a few seconds. What it accepts: a merge that breaks only contract, bundle or e2e tests (behaviour across two PRs, not types or units); those are the minutes of a full run, and the dev deploy's smoke test after the merge is the net |

### Options not taken

- **Require every head to contain main** (GitHub's "require branches to be
  up to date before merging"). Each merge after the first then needs a merge
  of `origin/main` and a `pnpm check:full`, ten to twenty-five minutes, one
  at a time on the Mac, and PRs ready together queue a full run each. The
  gate keeps it as the fast path (the head contains main) and replaces the
  rest with a check of minutes.
- **GitHub's merge queue.** Its required checks must report on the queue's
  own `gh-readonly-queue/main/...` commits (the `merge_group` event): either
  Actions runs the checks there, the minutes CI17 removed, or this Mac
  watches for queue branches and posts a proof, a process standing by that
  polls GitHub and costs while idle. It also re-checks the whole queue when
  one entry fails. The repo belongs to a user account (GitHub Pro), and
  GitHub has offered merge queues to organisation repositories (not checked
  on this plan). Reconsider if checks ever run on hosted runners again.
- **Check main after each merge** (before the next merge or deploy). It
  finds the break once main is red, and every PR behind it then fails until
  a fix lands; the same check before the merge prevents it.
- **Check the union of both sides' packages.** It adds every package main
  changed since the PR's base, which passed on main already: a frontend PR
  behind a backend change would run the backend's tests for nothing.
- **Keep the gate in the orchestrator's instructions.** It was applied by
  hand, with a manual frontend `tsc` when main's change touched contracts,
  and the incident above showed the shortcut it allowed.

## 2026-10-20: production releases one proven commit

**Decided:** 2026-10-20, owner (the question of how a production deploy is
approved). In the owner's
words: "Lets go with production. We will deploy to production with a github
action that releases a specific commit to prod." Replaces the provisional
rule (plan on main's head, apply refused if main moved); keeps its owner-only
start, its two runs and its role.

| #    | Choice | Why |
| ---- | ------ | --- |
| CI19 | **`deploy-production.yml` releases the commit the owner names.** The owner starts it on `main` (Run workflow) with a `sha`: any commit on main's history, main's head or an older one (a rollback). Its run is named `Plan <sha> to production` or `Release <sha> to production`. Before anything else, from main's checkout, the **release check** (`node tools/local-check/src/cli.ts release-check`, `tools/local-check/src/release.ts`) refuses a sha that is not one commit, a commit that is not an ancestor of `origin/main`, and one without **the local proof** (CI17): a `local/check-full` status in state success, posted by the owner's account (check:full posts with this Mac's `gh` session; a status a workflow's token posted does not count), on the Node major the commit's `.nvmrc` pins (CI16), either on the commit itself (a `pnpm check:full` run on a commit already on main measures it from its first parent, the main it was made on, not from itself, which would affect nothing) or, for a squash merge, on the head of the pull request merged into `main` that made it, when that head's tree is the commit's tree (the squash of a head that contained main; CI18's fast path). Only then is the release checked out, exactly that commit, and its own setup, `sst diff`, diff guard, `sst deploy` and smoke test run (`.github/actions/deploy-stage`, as the commit was proven). **Two runs, as before:** apply off plans, and the summary shows the release check, the diff and the guard's verdict; apply on is refused unless a passed plan run of the same commit exists, started by the owner from main's workflow file with the same `first_deploy` (the run's name carries ` (first deploy)`), that is newer than every earlier release run that ran (passed, failed or cancelled; a run the owner-only rule skipped does not count). **A release is never re-run** (a re-run keeps the run's id, so its first attempt would not count as a release that ran): plan again, then release. Kept: only the owner's GitHub account as actor and triggering actor, only `main`'s workflow file, the `production` environment, concurrency `deploy-production`, `first_deploy`, and the role `github-deploy-production`, which trusts this workflow file on `main` (its subject names it once the repository's OIDC subject includes `job_workflow_ref`; the template, `infra/aws/github-deploy.yaml`, takes the subject as a parameter and needs no change) | The owner asked for a release of a specific commit, not of whatever `main` holds when the button is pressed. A proof is about a tree, so it is checked, not trusted: a commit nobody proved, or one from a branch, cannot reach production through the workflow. A squash commit is a new commit with no status, and the merge gate (CI18) is what makes its tree the proven head's in the usual case; when main moved before the merge the trees differ and the check refuses, so that commit is proven by running `pnpm check:full` on it. The plan is checked by the same sha, since `main` moving no longer matters; a release in between can change production, so a plan older than it no longer shows what will change. The check runs from main's checkout so a release cannot weaken it; the deploy steps are the release's own, so a rollback runs exactly what was proven with it (an older release's summary names `$GITHUB_SHA` and shows no diff; the release check's summary names the release). What it does not change: `main` stays unprotected against a push by anyone with the owner's credentials, as stated when it was decided; the owner-only start and agents never starting it (`infra/CLAUDE.md`) remain what stops an accident |

### Options not taken

- **Keep releasing main's head only** (the provisional rule). A rollback
  would need a revert merged first, and a release would ship whatever merged
  between the plan and the button.
- **Trust the proof without checking it** (any commit on main). Main's commits
  carry no status of their own after a squash; whether one is proven is read
  from GitHub, so it is checked.
- **A tag or a release branch per release.** A second thing to push and
  protect; the sha in the run's title already names the release.

