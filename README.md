# Acme

A project template: a monorepo (Next.js app, Hono API on Lambda, SST deploy on
AWS) with the agent harness built around it: skills, a bead tracker, spec and
plan standards, owner review batches, a consistency sweep, an owner inbox, and
a local CI proof with a merge gate. The app is a thin skeleton (each of its files
says so in its header) that a real first feature replaces. In a fresh copy,
`pnpm rename <slug> "<Display Name>"` gives it the project's own name, once
(`tools/bootstrap/CLAUDE.md`).

## Start a project from it

1. **Copy it.** On GitHub, "Use this template", or clone it and drop the
   history, committing the copy (the rename reads the committed files and
   refuses a copy with no commit):

       git clone <template> <slug> && cd <slug>
       rm -rf .git && git init
       git add -A && git commit -m "Initial commit from template"

2. **Install.** `pnpm install` (Node 24 from `.nvmrc`, pnpm 10.34.5).
3. **Name it, once.** `pnpm rename <slug> "<Display Name>"` rewrites the
   placeholder name in every tracked text file and path, runs `pnpm install`,
   starts the issue tracker with the slug as its prefix and loads the seed
   memories. If it stops partway it prints what is left as commands; run
   `pnpm rename --resume`.
4. **Bootstrap it.** Open Claude Code in the folder and type `/bootstrap`. It
   runs seven steps, one question at a time, and resumes where it stopped
   (`pnpm bootstrap:state` shows where): basics, product brief, owner setup,
   design system, scaffold, replace the skeleton, and (optional, any time
   after step 1) AWS accounts. The skill is
   `.claude/skills/bootstrap/SKILL.md`.
5. **Run it.** `pnpm dev` starts the app and the API together, on in-memory
   fakes: no Docker, network or credentials.

The demo app is unauthenticated. **Nothing deploys until bootstrap step 6
replaces it:** `pnpm -C deploy sst:deploy` and the deploy workflows refuse while
`.bootstrap/state.json` says step 6 is not done (`deploy/CLAUDE.md`).

## Prerequisites

- Node 24 (`.nvmrc`) and pnpm 10.34.5. `pnpm check:full` refuses another Node
  major.
- Docker, running, for the backend's contract suites (`pnpm check` and
  `pnpm check:full`).
- `bd` (beads), the issue tracker, and `gh`, the GitHub CLI.
- AWS credentials only when deploying (`/bootstrap accounts`, then
  `infra/README.md`).

## The two rules that shape every change

**Local first.** Every resource (a table, a bucket, a queue, mail, sign-in, a
third-party API) runs on your machine behind a mock, and the whole project
runs locally and efficiently. Adding a resource adds a port, an in-memory fake
wired into `pnpm dev`, a contract suite, seed data and, where a person would
want to see its effects, a dev page, all in the same change. `pnpm offline`
proves `pnpm dev` starts with the network blocked. The full rule is in the
root `CLAUDE.md` (_Conventions & Patterns_).

**Cost is measured and idle is free.** The project is priced per billing unit,
so each unit's cost must be measurable: a paid service records its use in a
meter (`backend/src/platform/usage.ts`), asserted in its contract suite. And
an idle project costs close to nothing: build on pay-per-use services, and
treat anything billed by the hour while nothing happens as an owner decision.
Both are in the root `CLAUDE.md`, with the checks that enforce them.

## Where things are

`CLAUDE.md` names every component and the `CLAUDE.md` to read before touching
it: `design/`, `frontend/`, `backend/`, `deploy/`, `infra/`, `packages/` and
the `tools/` that run the harness (`preview`, `review-batch`, `sweep`,
`local-check`, `bootstrap`). `docs/` holds the product specs
(`docs/product/`), the technical specs and plans (`docs/superpowers/`), the
runbooks, and the decisions behind the template (`docs/decisions/`; start with
`2026-10-21-template-build-decisions.md`).

The everyday gate is `pnpm fix && pnpm check`. A branch is ready when
`pnpm check:full --ready` posts its proof; GitHub runs no check of its own.

Harness extracted from an earlier project.

## Issue tracking

Issues live in the repo, not on one machine — but **they do not ride along with
`git push`.** Beads uses two channels over the same remote, and only one of them
is the real thing:

| | What it is | Moved by |
|---|---|---|
| `refs/dolt/data` | The issue database. Full history, branching, merge semantics. **The source of truth.** | `bd dolt push` / `pull` / `sync` — *never* `git push` |
| `.beads/issues.jsonl` | A flat text mirror of the database (`export.auto: true`), for reading on this machine. Passive. **Ignored by git in this template** (`.gitignore`, TB89), so it never rides along with anything. | bd itself, on each change |

Verified rather than assumed: creating an issue and then running a plain
`git add && git commit && git push` leaves `refs/dolt/data` **unchanged**, and
the JSONL is not in the commit either. A teammate's database is not updated
until someone pushes Dolt.

### This is enforced, so you do not have to remember it

Relying on everyone remembering `bd sync` is how the tracker goes stale, so the
git hooks do it:

- **`pre-push` runs `bd sync` and aborts the push if it fails.** Blocking is
  deliberate — shipping code whose issues stayed behind is the exact failure
  this prevents, so it fails loudly rather than succeeding quietly.
- **`post-merge` runs `bd dolt pull`**, so pulling someone's code brings their
  issues too. Non-blocking: a failed pull must never break your working tree.

Offline, or the remote is down:

```bash
BEADS_SKIP_SYNC=1 git push
```

Both live *outside* the `BEADS INTEGRATION` markers in `.beads/hooks/`, because
`bd hooks install` rewrites only the marked section and preserves the rest — so
they survive bd upgrades. Beads' own `pre-push` hook is a no-op; this is ours.

`bd sync` is one cycle of pull → conflict-check → repair → push. It is preferred
over `bd dolt push`/`pull` separately because it detects conflicts positively
from Dolt's conflict tables rather than inferring them from an exit status, and
it recomputes `is_blocked` so `bd ready` is not stale after someone else's
dependency edges merge in.

```bash
bd ready          # what is unblocked
bd create "..."   # new issue
git push          # ships code AND issues
bd sync           # only needed if you want to exchange without pushing code
```

### Do not trust the JSONL

It is a local file, and it can lag the database. Deleting an issue leaves the
record in `.beads/issues.jsonl` until an export reconciles it, and a plain
`bd export` does not necessarily remove it. If the two disagree, **the Dolt database is
right.** Never hand-edit the JSONL, and do not read it to answer "what issues
exist" — run `bd list`.

### Joining from a fresh clone

A clone has no issue database until you bootstrap it. (A copy of the template
itself gets its tracker from `pnpm rename`, which runs `bd init`; this is for
the second machine or teammate, once the project has a remote.)

```bash
bd bootstrap                 # pulls the issue history from the git remote
bd hooks install --beads     # wires core.hooksPath; bootstrap does NOT do this
git config beads.role maintainer
```

That second line is easy to miss. `bd bootstrap` restores the issues but leaves
`core.hooksPath` unset, so without it nothing auto-exports and your issue writes
stay local — which looks exactly like it working until someone else cannot see
them. (`pnpm install` also points an unset `core.hooksPath` at `.beads/hooks`,
whose `pre-push` runs the fast checks too: root `CLAUDE.md`, Build & Test.)
