# tools/local-check

`pnpm check:push` and `pnpm check:full`: every check, on this machine, and
the proof main's branch rule requires; `pnpm merge-gate`: whether a PR may
merge now. GitHub runs no check (CI17): ci.yml's
one job, `proof`, only reads that proof. Why:
`docs/decisions/2026-10-06-ci-decisions.md` (CI1, CI2, CI9 to CI12, CI15 to
CI18). How an agent uses them: root `CLAUDE.md`, Build & Test. It also holds
the step the `proof` job runs, `node tools/local-check/src/cli.ts proof-scope`,
and the release check `deploy-production.yml` runs before it releases a
commit, `node tools/local-check/src/cli.ts release-check` (CI19), both Node
built-ins only, no install.

| Command                   | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check:push`         | What the pre-push hook runs: format, lint, types, knip, unit and browser tests of the affected packages (one package at a time), the sweep lint. Then, if the branch's PR is open and ready for review, `pnpm check:full` too unless that commit already passed it. A commit that passed gets its proof posted in the background once the push lands (`<git data>/acme/post.log`)                                                                                                                                                                                                                                                                                                         |
| `pnpm check:full`         | `check:push`'s suites, then the backend's contract and bundle tests, `pnpm competitors check`, `backend/CLAUDE.md`'s truth test, and, when selected, e2e on the production build (the frontend; every project this machine runs), the OpenNext build (the frontend or deploy) and the preview smoke test (preview, the frontend or the backend), then, on every run, `offline`: `pnpm dev` with the network blocked (below), and `rename-copy`: `pnpm rename` on a copy of HEAD, then `pnpm check` in it (`tools/bootstrap/CLAUDE.md`). Refuses a worktree with changes or untracked files. Records the pass; posts the proof if the commit is on GitHub and re-runs a failed `proof` job |
| `pnpm check:full --ready` | The same, then `gh pr ready` for the branch's draft PR                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm offline`            | The `offline` step alone: `pnpm dev` with Node refusing every connection off this machine, its start timed against `DEV_START_BUDGET_MS`, then `frontend/e2e/skeleton.spec.ts` on Chromium with every request off localhost aborted. `--budget <ms>` overrides the budget to diagnose a loaded machine; `check:full` never passes it                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm merge-gate <pr>`    | The orchestrator's merge gate (CI18): the PR's checks and head, and, when main moved since the head's base, the merge result's checks across packages in a throwaway worktree. Prints PASS and the `gh pr merge` to run, or BLOCKED and why. Never merges, pushes or posts                                                                                                                                                                                                                                                                                                                                                                                                                |

"Affected" is turbo's, measured from `git merge-base HEAD origin/main`, as
the `proof` job measures from the first parent of GitHub's merge commit. A
commit already on main is its own merge base, so it is measured from its
first parent instead (CI19: proving a squash commit for its release).
With no `origin/main` (a new project before bootstrap step 3 makes its
GitHub repository) or a root commit, there is nothing to measure from, so
every package counts as changed and every suite runs on all of them; with no
GitHub remote, `pnpm check:full` records the pass here, prints "no GitHub
remote: recorded, nothing posted" and succeeds (`--ready` fails: no PR).

| File                   | What it holds                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/plan.ts`          | The suites of each level, in order, which hold the lock, and what is not run. Worker caps                                                                                                              |
| `src/flows.ts`         | The pre-push check, `check:full`, and posting once pushed                                                                                                                                              |
| `src/merge-gate.ts`    | `pnpm merge-gate`: the checks it reads, the packages both sides of a merge affect, the suites it runs                                                                                                  |
| `src/lock.ts`          | The machine-wide lock heavy suites hold                                                                                                                                                                |
| `src/record.ts`        | Pass records, one per commit, in `<git data>/acme/check-full/`                                                                                                                                         |
| `src/github.ts`        | The `local/check-full` commit status, the PR's state, re-running a failed `proof` job                                                                                                                  |
| `src/node-pin.ts`      | The repo's Node major (`.nvmrc`) and the message when this shell runs another (CI16)                                                                                                                   |
| `src/e2e-matrix.ts`    | The e2e projects and Node a proof names, and `proofScope`: whether a proof covers a pull request (CI15, CI17)                                                                                          |
| `src/repo.test.ts`     | Pins that check:full runs every check, that ci.yml is the one `proof` job, and the names the two share                                                                                                 |
| `src/release.ts`       | `release-check`: the commit production releases is on main's history and proven (its own proof, or its squash's pull request head with the same tree), and an apply follows a passed plan of it (CI19) |
| `src/exec.ts`          | The injectable runners for git, gh and pnpm, and `launchWith`, which starts `pnpm dev` and stops only its own process group                                                                            |
| `src/offline.ts`       | `runOffline` and `DEV_START_BUDGET_MS`: the offline step                                                                                                                                               |
| `src/offline-guard.ts` | The preload that refuses connections off this machine (`NODE_OPTIONS=--import=...`); `src/loopback.ts` says which hosts are this machine                                                               |

## Rules

- **Every check runs here.** GitHub runs none (CI17), so a check that
  `pnpm check:full` does not run is checked nowhere: a new check goes in
  `plan.ts` (`src/repo.test.ts` holds that every task of the root
  `pnpm check` is in it). The one thing it can leave out is the iphone
  project on macOS below 15, whose WebKit Playwright no longer supports
  (`frontend/e2e/phones.ts`); the `proof` job then refuses the proof for a
  change that affects the frontend, so run it on macOS 15 or later.
- **One heavy suite at a time per machine.** The unit and browser tests
  (so every `git push` queues too), contract, bundle and e2e tests, the
  OpenNext build and the preview smoke hold a lock in the git data every
  worktree shares; a second worktree waits and says for whom. The lock is the
  holder's pid: a run that dies, or holds it over two hours, leaves a lock
  the next one breaks. Each suite runs in its own process group, killed with
  local-check (a tool's timeout), so no e2e server outlives its lock. A
  suite that prints nothing for 15 minutes is hung, not slow: its group is
  killed and the suite fails with 124 (`exec.ts`), so a hung run frees the
  lock in minutes, not two hours. e2e
  runs on its own ports (3190, 8798; declared in turbo.json's
  `e2e.passThroughEnv`, or turbo drops them), so a `pnpm e2e` or `pnpm dev`
  elsewhere never collides with it. The preview smoke starts this worktree's
  preview on ports `pnpm preview` picks, and stops only one it started.
- **Nothing after `--` for a cached task**: turbo hashes those arguments, and
  the task would stop replaying what `pnpm check` passed. Unit tests run one
  package at a time instead of capping Vitest's workers. e2e is never
  cached: `ACME_E2E_WORKERS` (Playwright, default 3); it retries once and
  `test.only` fails.
- **A full run proves the commit it started on** only if the worktree still
  holds that commit, clean, when it ends; otherwise nothing is recorded.
- **The proof is a commit status**, `local/check-full`, on the exact commit
  that passed with a clean worktree. main's branch rule requires it and the
  `proof` job, which looks for it (`.github/scripts/local-proof.sh`, step
  "Local check proof"), then asks turbo whether the change affects the
  frontend and runs `proof-scope` (step "Proof covers the change"). Posting
  the proof re-runs a failed `proof` job. No label waives it.
- **The proof says what it ran, first** (CI15, CI16): its description begins
  `[e2e production:chromium,android,iphone node24]`
  (`[e2e none node24]` without the frontend), from what `plan.ts` ran on this
  machine, so a machine below macOS 15 claims no iphone. `proofScope` passes
  a proof on the repo's Node major, and, for a change that affects the
  frontend, only one that names every project on the production build. A record from
  before CI16 names no Node and reads as no pass, so the commit is checked
  again. The description must stay under 140 characters with the e2e words
  first.
- **Run on the repo's Node** (CI16): `.nvmrc` is the one pin (every
  `setup-node` reads it too). `pnpm check:full` refuses another major and
  `pnpm check:push` warns: a newer Node has globals Node 24 lacks
  (`sessionStorage`), so a test passed here and failed on Node 24. Switch
  with `pnpm env use --global 24` or `nvm use`, in a new shell, or put a
  Node 24 first on `PATH` for the one command; `node -v` must say the pinned
  major.
- **Dependabot's PRs** have no machine that pushed them, so their `proof` job
  fails at once. To merge one: comment `@dependabot rebase` if it is behind
  `main`, wait for the new head, `gh pr checkout <n>` in a clean worktree,
  run `pnpm check:full --ready` on Node 24. That posts the proof on the
  Dependabot commit (posting a status needs write access to the repo, not
  authorship of the commit; nothing here checks the author) and re-runs the
  failed `proof` job; the PR is not a draft, so `--ready` marks nothing. Then
  the merge gate applies as usual.
- **The merge gate checks the merge, not the overlap** (CI18). Two PRs
  each proven, with no file in common, broke main together (#134 after #139:
  a fixture lacked the required fields the other added).
  `pnpm merge-gate <pr>` passes a head that contains `origin/main` at once;
  otherwise it builds the tree GitHub's squash would make (`git merge-tree`,
  then a local commit nobody pushes) in
  `<main checkout>/.claude/worktrees/merge-gate-pr<n>` (one run per PR at a
  time), installs from the local store, and runs `check:push`'s suites on
  the packages both sides affect, then the sweep lint and the truth test.
  Each side is measured from their merge base, in the merge result: turbo's
  affected packages, plus those whose tasks read a file it changed outside
  their folder (`rootReaders`, from turbo.json's `$TURBO_ROOT$` inputs and
  the root's `//#format`), which turbo's `--affected` does not count. Only
  those packages can break: one that only one side affects is as that side
  passed it. Contract, bundle and e2e tests are not run there. The worktree
  goes when it ends, fails or is killed. Its PASS holds for the origin/main it names: if main moves before
  the merge, run it again. Run it on the repo's Node, like `check:full`.
- **The hook file is the main checkout's.** `core.hooksPath` is an absolute
  path to the main checkout's `.beads/hooks`, so every worktree runs that
  copy of `pre-push`, whatever branch it is on, and it changes only when the
  main checkout pulls. The hook therefore only calls `pnpm check:push`; what
  that runs lives here and ships with each branch.
- **The offline step proves local first** (root `CLAUDE.md`, "Local first").
  `src/offline.ts` starts `pnpm dev` on two free ports (turbo's `dev` task
  passes `PORT`, `DEV_API_PORT`, `NODE_OPTIONS` and `ACME_OFFLINE_LOG` through)
  with `NODE_OPTIONS=--import=src/offline-guard.ts`. The guard patches
  `net.Socket.prototype.connect` (http, https, tls and fetch's undici all pass
  through it), `fetch`, UDP and DNS (`lookup`, `resolve*`, `Resolver`, plain and
  `promises`): anything but `localhost`, `*.localhost`,
  127.0.0.0/8 and ::1 fails with `EOFFLINE`, is printed, and is appended to
  `ACME_OFFLINE_LOG`, which the step reads, so an app that swallows the error
  still fails the run. It blocks what the app does, not every process on the
  machine. The browser is blocked by `frontend/e2e/test.ts` (its auto fixture,
  active with `ACME_OFFLINE=1`), which fails a test whose page made a request
  off localhost. Then:
  - **Start budget.** The start is the time from launching `pnpm dev` to a
    200 from `/api/health` through Next's proxy. `DEV_START_BUDGET_MS` is 1.5
    times the baseline (`DEV_START_BASELINE_MS`) measured on the owner's
    machine (cold `frontend/.next/dev`, median of 7 runs; build decision
    TB75). A start over the budget is tried once more, since other sessions
    share the machine; two in a row fail. Re-measure to change it.
  - **Known tool traffic** (`TOOL_TRAFFIC`): Next's dev server asks the npm
    registry whether it is out of date. The guard refuses it all the same; the
    step does not fail for it. A new entry needs a reason in that comment.
  - **Stopping.** The step stops only what it launched, by pid: turbo runs each
    task in a group of its own, so `launchWith` (`src/exec.ts`) snapshots the
    launched process's descendants and signals them as well as its group. It
    sends SIGTERM, waits up to 10 s, then SIGKILLs the rest; an interrupt
    (SIGINT, SIGTERM) of local-check stops every running suite and server,
    in parallel and gracefully, before it exits (one handler for all, in
    `exec.ts`); a second signal while that is under way SIGKILLs what is left
    and exits at once.
  - **A new e2e spec** imports `test` and `expect` from `./test`
    (`frontend/eslint.config.mjs` bans `@playwright/test` in `e2e/**/*.{spec,test}.{ts,tsx}`, the files Playwright runs),
    or it is not covered by the browser block, which also aborts WebSockets.
    The browser's host rule is a copy of `src/loopback.ts`
    (`src/loopback-parity.test.ts` fails if they differ).
- **Node runs the source directly**: relative imports end in `.ts`, and only
  erasable TypeScript syntax is allowed.
