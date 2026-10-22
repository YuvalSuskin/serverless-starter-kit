# tools/preview

`pnpm preview`: run any branch on this machine on its own URL. The owner-facing entry
is the `/preview` skill (`.claude/skills/preview/SKILL.md`).

| Command                                               | What it does                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm preview <target>`                               | resolve, find or create the worktree, install, start API + Next, open `http://<slug>.localhost:<port>` |
| `pnpm preview list`                                   | running previews                                                                                       |
| `pnpm preview stop <target> [--remove]`, `stop --all` | stop; `--remove` deletes a worktree preview created, if clean and pushed                               |
| `pnpm preview doctor`                                 | what this machine is missing, with the fix                                                             |

## Rules

- **Node built-ins and one workspace import, no packages from npm.** The
  workspace import is `@acme/sweep/prefix`, the one reader of the project's
  bead-ID prefix (`tools/sweep/src/prefix.ts`). Node runs the source
  directly: relative imports end in `.ts`, and only erasable TypeScript syntax
  is allowed (`erasableSyntaxOnly`).
- **Tests use real git** in temporary repos (`src/testing.ts`); `gh`, `bd`,
  `pnpm` and other tools are scripted, and an unscripted one returns 127.
- **Never signal a process group unless it is provably ours**: alive, and
  either holding its own port or launched in the last 90 s (a reboot can hand
  a PID to a stranger, but a stranger does not hold our port). Never remove a
  worktree preview did not create, or one with changes or unpushed commits.
- **Choosing ports and launching run under a repo-wide lock**
  (`<git-common-dir>/preview.lock`, `src/lock.ts`), and ports that a starting
  preview has reserved but not bound yet are never handed out again.
- State lives in `<worktree>/.preview/` (ignored by its own `.gitignore`).
- `src/hooks/bead-branch.ts` is a Claude Code `PostToolUse` hook
  (`.claude/settings.json`): it must stay silent and always exit 0.
