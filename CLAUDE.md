# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:46cd31e7 -->

## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**

- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.

<!-- END BEADS INTEGRATION -->

## What this repo is

The Acme monorepo. Each top-level component has its own `CLAUDE.md`; read
it before touching anything inside that component.

    design/              brand source of truth -- see design/CLAUDE.md
    frontend/            the Next.js app, route groups (marketing) and (app) -- see frontend/CLAUDE.md
    backend/             the API (Hono on Lambda, DynamoDB) -- see backend/CLAUDE.md
    deploy/              the SST app: every stage's AWS resources -- see deploy/CLAUDE.md
    packages/contracts/  what frontend and backend share: route contracts, roles, errors
    packages/config/     the shared ESLint base and tsconfig bases
    tools/preview/       pnpm preview: run any branch on its own URL -- see tools/preview/CLAUDE.md
    tools/review-batch/  pnpm review-batch: builds the owner's review page -- see tools/review-batch/CLAUDE.md
    tools/sweep/         pnpm sweep: the consistency sweep's deterministic steps -- see tools/sweep/CLAUDE.md
    tools/local-check/   pnpm check:push and check:full: CI's checks run locally first -- see tools/local-check/CLAUDE.md
    tools/bootstrap/     pnpm rename and pnpm bootstrap:state: names a fresh clone, tracks /bootstrap -- see tools/bootstrap/CLAUDE.md
    infra/               the platform: AWS accounts, sign-in, guardrails -- see infra/CLAUDE.md
    docs/                specs, plans, research, and the owner's decisions (open and made)
    docs/product/        product specs: what users see and do -- see docs/product/CLAUDE.md

**The app is the template's skeleton** until bootstrap step 6: a demo (a
contact form that stores messages and mails the owner, one public page, one
app page, and the deploy that ships them) with one of each layer, so every
check has something to check. Every such file is marked `Skeleton:` in a
header comment; step 6 replaces them with the project's first feature
(`.claude/skills/bootstrap/steps/6-replace-skeleton.md`).

The root holds workspace glue only: `package.json`, `pnpm-workspace.yaml`,
`turbo.json`, the Prettier config and CI.

## Infrastructure

Everything runs on AWS in the one region `deploy/accounts.json` names: data
stays there, and an SCP enforces it. Until `/bootstrap accounts` fills that
file nothing deploys. Three accounts: management (billing and sign-in
only), `acme-dev` and `acme-prod`. Sign in with `aws sso login`; the
default profile is dev. **Never act in prod or management unless the owner
asked for that specific action**, and never change platform resources
without the owner's go-ahead. Details, IDs and how-tos: `infra/README.md`
and `infra/CLAUDE.md`.

**Agents work in dev without asking** (A9 in
`docs/decisions/2026-09-28-aws-account-decisions.md`): deploy, update and
remove the app in `acme-dev`, set its secrets and make technical
choices, logging each choice. Only a change a user would notice, going
against a recorded decision or promise, or anything billed while idle
(_Pay per use_ below) becomes a review-batch item. No
secret value ever goes in a chat, a bead, the repo, a log or a test.
Production is decided later; until then the prod rule above holds.

## Build & Test

TypeScript packages (pnpm 10.34.5, Node 24, Turborepo; see each package's
`CLAUDE.md`):

```bash
pnpm install
pnpm fix                   # autofix lint + format, every package
pnpm check                 # format, lint, types, knip, all tests. The
                           # backend's contract tests need Docker running.
pnpm dev                   # Next.js and the API together
pnpm offline               # pnpm dev with the network blocked, within its start budget,
                           # then the skeleton e2e spec (check:full runs it; "Local first" below)
pnpm rename <slug> "<Display Name>"
                           # once, in a fresh clone of the template: its own
                           # name and tracker (tools/bootstrap/CLAUDE.md)
pnpm bootstrap:state       # where /bootstrap stands: each step, then the next
                           # (.claude/skills/bootstrap/SKILL.md)
pnpm preview <target>      # (repo root) run a branch, PR, bead or worktree on its own URL;
                           # list, stop, doctor (see tools/preview/CLAUDE.md)
pnpm e2e                   # a production build, then Playwright tests on desktop,
                           # iPhone and Android (frontend/CLAUDE.md)
pnpm -C deploy sst:diff --stage dev     # read before every deploy, then
pnpm -C deploy sst:deploy --stage dev   # deploy dev (runbook:
pnpm -C deploy smoke --stage dev        # docs/runbooks/deployment.md)
```

Run from a package's folder, the same commands cover only that package.

**Run checks on the pinned Node** (`.nvmrc`, Node 24, the version the Lambdas run):
`pnpm check:full` refuses another major and `pnpm check:push` warns (CI16).
Check with `node -v`.

**`git push` runs `pnpm check:push` first** (`.beads/hooks/pre-push`, wired by
`pnpm install`): format, lint, types, knip and unit tests of what the branch
changes, then the sweep lint. A failure stops the push.
**CRITICAL:** Do NOT use `gh run watch`, `gh pr checks --watch`, or `until` bash loops to poll CI status.
Run `git push`, and if it succeeds locally, assume the task is complete and proceed. Do not block the session waiting for remote GitHub Actions. Only in an emergency: `ACME_SKIP_CHECKS=1 git push`
(the proof is still required before a merge).

**The local proof is the gate; GitHub runs no check** (CI17). Open a PR as a
draft (`gh pr create --draft`): a draft runs nothing. When it is ready, run
`pnpm check:full --ready`: every check (contract, bundle and e2e tests of
what the branch changes, every project on the one build, the OpenNext build,
the preview smoke, the offline run, one heavy suite at a time on the machine), then it posts
the proof, the `local/check-full` status, on the commit and marks the PR
ready. GitHub's one job, `proof`, takes seconds: it passes only when that
status is on the head, from the repo's Node, covering the e2e the change
needs. main's branch rule requires `local/check-full` and `proof`. So after
any later commit (a review fix, a merge of `origin/main` for the merge gate)
run `pnpm check:full` before pushing; the hook runs it itself on a push to a
ready PR, which can outlast a 10-minute timeout. Merge `origin/main` locally,
never with GitHub's "Update branch" (its commit has no proof). The
orchestrator merges only on `pnpm merge-gate <pr>`'s PASS, with the
`gh pr merge` it prints (CI18). A Dependabot PR gets its proof the same way, from a checkout of its head. A merge to
`main` runs nothing on GitHub: the orchestrator then deploys dev from the
Mac (the deploy commands above, with `pnpm -C deploy diff-guard` on the saved
diff; runbook, "The deploy pipeline"). Details: `tools/local-check/CLAUDE.md`;
why: `docs/decisions/2026-10-06-ci-decisions.md`.

Design pipeline (Python; see `design/CLAUDE.md`):

```bash
python3 design/scripts/tokens/build_tokens.py   # tokens.json -> design/tokens/tokens.css
```

There is no pytest here: verification means rebuilding and looking at
`git status`. The font is an npm package (`frontend/src/app/fonts.ts`), not a
build step.

## Conventions & Patterns

- **Generated files are committed and must not be hand-edited.**
  `design/tokens/tokens.css` is build output. An edit there is destroyed on
  the next build. `design/CLAUDE.md` says which is which.
- **Builds are reproducible.** Rebuilding `design/` or `frontend/` leaves the
  worktree clean. If `git status` is dirty after a rebuild, something
  genuinely changed; do not wave it through.
- **Verify by rebuilding, not by reading the diff.** Deleting the generated
  output and rebuilding from nothing is the standard check.
- **The owner decides in batches.** Product specs, open decisions and other
  items that need the owner are drafted by agents and approved on a review
  page, one batch at a time: the `review-batch` skill (`/review-batch <n>`).
  Never hold work waiting on a conversational question the batch could ask;
  label the bead `batch-<n>` and continue with other work. Between batches,
  a question with its recommendation reaches the owner on the owner's inbox
  page (<owner-inbox-url>), where they answer when they choose; it never goes
  into the conversation. The `owner-inbox` skill says how to add an item, read
  the answers and hide a handled one.
- **Technical designs follow `docs/superpowers/specs/CLAUDE.md`:** a second
  agent reviews each one written in batch mode (not one the owner approved in
  conversation), and only owner-level choices become review-batch items.
- **One home per rule; link, never restate.** Each kind of truth has one
  home (`docs/superpowers/specs/2026-09-30-sweep-design.md` §2): decisions in
  `docs/decisions/` with their beads, what users see in `docs/product/`, how
  to work in a component in its `CLAUDE.md`, a recurring task in its skill.
  Elsewhere, link to the home. `docs/archive/` and `docs/reviews/` are
  history, never a source of rules. `/sweep` finds what drifted; a
  contradiction found outside a sweep becomes a bead labelled
  `sweep-escape`.
- **Memories hold only workflow knowledge that cuts across components and
  has no other home** (H5): kept tiny, since `bd prime` loads them into every
  session. (The Beads block's "use `bd remember`" means instead of MEMORY.md
  files, not instead of a `CLAUDE.md`.) A new owner preference may land there first; once a `CLAUDE.md`,
  skill or decision holds it, the memory goes (the sweep raises it).
- **Implementation plans follow `docs/superpowers/plans/CLAUDE.md`:** each
  task is one green `pnpm check` and a commit, carries no full code, and uses
  that file's task sections.
- **Batch and Surgical Edits:** To save time and tokens, consolidate your file changes. Avoid using the editor tool multiple times on the same file. Use targeted `sed` commands or surgical file edits instead of full file rewrites.
- **Context Management:** Use targeted file reads (e.g., line ranges) instead of dumping entire files into context.
- **Subagent Delegation:** When delegating a task to a subagent, pass ONLY the specific task instructions, files, and interfaces it needs. Do NOT copy-paste the entire multi-task plan or product spec into its prompt. Instruct it to read the plan file itself if broader context is needed.
- **User-facing work starts with its product spec.** Work that changes what a
  user sees or does starts with its spec in `docs/product/` (skill:
  `product-spec`), before technical design. Work with no user-visible effect
  (logging, cost, infrastructure) needs none.
- **Designing a screen, or writing text a user will read, starts at
  `design/DESIGN.md`,** once the product spec exists.
- **`frontend/` reads `design/` only through `@acme/design`'s exports**
  (`design/package.json`): today that is the tokens CSS alone.
- **The frontend reaches the backend only through `@acme/contracts` and
  `frontend/src/lib/data/`.** API changes are additive only: an old tab must
  keep working.
- **Local first: every resource runs on this machine behind a mock, and the
  whole project runs locally and efficiently.** A resource is a database
  table, object storage, a queue, a scheduled job, a workflow, mail or SMS,
  sign-in, an AI or media service, a third-party API, or a CDN or edge
  behaviour that changes what a request returns. Adding one adds all of this
  in the same change:
  1. **a port** in the domain and the real adapter behind it;
  2. **an in-memory fake**, wired into `pnpm dev`, needing no Docker, no
     network and no credentials;
  3. **a contract suite** that runs on the fake, on a local emulator where
     one exists, and on the bundled adapter;
  4. **seed data** in the dev seed, so a fresh `pnpm dev` shows the resource
     in a realistic state;
  5. **a dev page** for any resource with effects a person would want to see
     (sent mail, stored files, queued or scheduled jobs, sign-in), as
     `/api/dev-mail` does;
  6. **for a paid service, its meter** in `backend/src/platform/usage.ts`,
     recorded by the adapter and asserted in the contract suite (the cost
     rule below).

  The frontend side: every route it calls has an MSW mock built from its
  contract (Vitest and Storybook); locally it runs against the real backend
  on fakes, which `pnpm dev` starts with it, never a frontend-only mode;
  third-party browser scripts are off or stubbed; fonts are bundled, never
  fetched while running.

  A resource that cannot run locally is an exception only the owner grants,
  as a review-batch item that names what is lost locally and what covers it
  instead (a deploy smoke test, say). A resource never makes `pnpm dev` need
  the cloud, Docker or the network (Docker is only for the emulator runs of
  the contract suites). **Efficient means measured:** a cold `pnpm dev`
  answers `/api/health` within `DEV_START_BUDGET_MS`
  (`tools/local-check/src/offline.ts`), 1.5 times the baseline measured on
  the owner's machine; raise it only by re-measuring.

  Checked, not hoped for. `backend/tests/rules/structure.test.ts` fails an
  adapter folder with no fake, no contract suite or no wiring in
  `src/entries/dev`. The `offline` step of `pnpm check:full` (`pnpm offline`
  alone) starts `pnpm dev` with Node refusing every connection but to this
  machine, checks the start budget, and runs `frontend/e2e/skeleton.spec.ts`
  with the browser aborting every request off localhost. A spec imports
  `test` from `frontend/e2e/test.ts` to be covered. Details:
  `tools/local-check/CLAUDE.md`.

- **The cost of each `<billing-unit>` is measurable.** Acme is priced per
  `<billing-unit>` (bootstrap step 2 names it: a user, workspace, order,
  event or another), so we must know what each one costs us. Work that adds
  a paid service (AWS or external) records its use per `<billing-unit>`: a
  meter in `backend/src/platform/usage.ts`, recorded by that service's
  adapter and asserted in its contract suite (`backend/CLAUDE.md`). Storage
  keys start with the unit's prefix, so stored bytes stay attributable. A
  cost that cannot be split by `<billing-unit>` (WAF, idle functions, logs)
  is named in the cost model as a shared cost, never left out.
- **Pay per use: an idle Acme costs close to nothing.** Build on
  serverless services billed only by use (Lambda, DynamoDB on demand, S3,
  CloudFront, SQS, Step Functions) and choose the cheapest pay-as-you-go
  option. Small standing costs are accepted: stored bytes, a hosted zone, a
  key. Anything billed by the hour while nothing happens (a NAT gateway, a
  database or cache instance, provisioned concurrency, a container kept
  running, a flat-rate plan) breaks this rule: it goes to the owner as a
  review-batch item, with the pay-per-use options it was compared to.
- **pnpm refuses package versions less than a day old** (`minimumReleaseAge`).
  If an install fails with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`, wait; never
  add an exclusion to get around it.
- Design values live in `design/tokens/tokens.json`, whose comments explain
  what each value holds and what was traded for it.
