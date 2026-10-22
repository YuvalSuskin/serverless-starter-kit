---
name: preview
description: Run a branch locally on its own URL so the owner can check it end to end. Use when the owner says "preview", "check the branch", "let me see <feature>", "open PR #N", "test <task> locally", or describes a piece of work they want to try. Takes branch names, PR numbers, bead ids, worktree names, or a plain description (resolved through beads), starts it with `pnpm preview`, opens it, and walks the bead's acceptance criteria.
---

# Preview a branch

`pnpm preview` (tools/preview) does the mechanics: worktree, install, ports,
servers, health. Your job is judgement: what the owner means, and what to check.

## 1. Resolve the target

- **Exact targets** go straight to step 2: a branch, a PR number, a PR URL, a
  bead id (`acme-5ss.1`), part of a worktree name, or `.` (this worktree).
  **Quote a PR number** (`pnpm preview '#12' --no-open`): an unquoted `#`
  starts a shell comment, and the command gets no target at all.
- **A description** ("the checkout redesign work"): search for it.
  1. `bd search "<key words>"`, and `bd list --has-metadata-key branch --all`
     for beads with a recorded branch. Prefer in-progress and recently closed ones.
  2. `git worktree list`, and match branch and folder names.
  3. One clear match: use its bead id. Several: list them (id, title, branch,
     status) and ask which one. None: say so, and show `pnpm preview list` and
     the worktrees. Never guess.

## 2. Start it

Run from the repo root: `pnpm preview <target> --no-open`. It prints
`Ready: <url>` (or why it failed: read the log lines it prints). Then open
the URL in the Browser pane, and give the owner the URL for their own Chrome.

## 3. Check it against the bead

If the target is a bead (or resolved to one), run `bd show <id>` and present
its acceptance criteria as a checklist to test against, next to the URL.

After the owner has tried it, **ask** before writing anything:

- passed: `bd comments add <id> "Previewed <branch>@<short sha>: passed"`
- issues: the same comment with the issues, and offer a bead per issue:
  `bd create --title "<issue>" --deps discovered-from:<id> --type bug`

## 4. Stop it

Offer `pnpm preview stop <slug>` when the owner is done.
`pnpm preview stop <slug> --remove` also deletes a worktree that preview
created, and only when it has no changes and nothing unpushed.

## Agents verifying their own UI work

After finishing a UI change: `pnpm preview . --no-open`, then
`E2E_BASE_URL=<url> pnpm --filter @acme/frontend exec playwright test`.
A preview shows the hidden marketing pages; for what production shows, see
`tools/preview/CLAUDE.md`, and `frontend/CLAUDE.md`'s e2e rows for testing it.
Attach screenshots of the changed screens to the PR. Stop the preview after.
