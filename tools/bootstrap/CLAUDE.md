# tools/bootstrap

Turning the template into a named project: the rename, and the state of the
`/bootstrap` skill's steps (`.claude/skills/bootstrap/SKILL.md`). Design: §5
and §7 of the template design (the rename; the bootstrap); decisions: the
template-build log (`docs/decisions/2026-10-21-template-build-decisions.md`,
TB93 on).

| Command                                                | What it does                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm rename <slug> "<Display Name>"`                  | Once, in a fresh clone of the template: rewrites the placeholder in tracked text files and renames paths that hold it, deletes the root marker file, runs `pnpm install`, `bd init` with the slug as prefix, imports `.beads/seed-memories.json` and files the two inherited docs' anchor beads |
| `pnpm rename --resume`                                 | After a step past the rename failed (the failure prints every step left, as commands): runs every step after the rename again; each is safe to repeat                                                                                                                                           |
| `node tools/bootstrap/src/rename-copy.ts`              | `check:full`'s `rename-copy` step: the rename on a `git archive HEAD` copy, then `pnpm check` there, then no placeholder outside the allowlist; skips when HEAD has no marker                                                                                                                   |
| `pnpm bootstrap:state [done <step> \| defer accounts]` | Where `/bootstrap` stands: each step's status in `.bootstrap/state.json`, then `next: <step>`; `done` and `defer` record a step today                                                                                                                                                           |

| File                     | What it holds                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/rename.ts`          | `renameProject`: the checks, the replacement rules in order, the allowlist with each entry's reason, and `leftovers`                                                                                                         |
| `src/cli.ts`             | `pnpm rename`: the rename, then the install and the tracker steps; prints a short report, never prompts                                                                                                                      |
| `src/finish.ts`          | The steps after the rename, each safe to repeat, and the report a failed one prints                                                                                                                                          |
| `src/tracker.ts`         | The tracker database a copy may already hold: an empty one (bd prime's) is set aside before `bd init`, one holding anything stops the rename                                                                                 |
| `src/rename-copy.ts`     | The `rename-copy` step                                                                                                                                                                                                       |
| `src/bootstrap-state.ts` | The bootstrap's steps, the state file's shape, and the resume rule `nextStep` (pure)                                                                                                                                         |
| `src/state-cli.ts`       | `pnpm bootstrap:state`                                                                                                                                                                                                       |
| `src/fills.test.ts`      | `.claude/skills/bootstrap/fills.json` against the repo: each token in exactly its listed files until its step is done, in none after; every placeholder in the platform, deploy and decision docs a fill or named doc syntax |
| `src/skill.test.ts`      | The skill's files: one per step with its four sections, step 6's list against the files carrying the skeleton marker, the trial brief free of real accounts                                                                  |

## Rules

- **The marker file means "not yet renamed".** The root file named after the
  placeholder (`MARKER` in `src/rename.ts`) is in the template and nowhere
  else; the rename refuses without it, so it runs once.
- **A refusal changes nothing.** The name, the marker, a commit that tracks
  the marker (a copy made with `rm -rf .git && git init` has none) and a clean
  tree are checked first; then every rewrite is computed in memory and checked
  against the allowlist before a file is written.
- **Tracked text files only.** Never a binary, an untracked file, `.git/`,
  `node_modules/` or `pnpm-lock.yaml` (`pnpm install` regenerates it).
  Third-party package names that hold the placeholder are left as they are.
- **Every placeholder left over is on the allowlist, with its reason.** A
  new kind of placeholder in the template fails the rename test and
  `rename-copy` until a rule or an allowlist entry covers it.
- **A failure after the rename names what is left.** The marker is gone by
  then, so `pnpm rename` refuses a second run; the failure lists each step
  that did not run as commands, `pnpm rename --resume`, and how to start over.
- **A copy's empty tracker is set aside, never deleted.** `bd prime` (the
  SessionStart hook, which skips only while the marker exists and no
  database does, so the template's own sessions are still primed) and other bd
  commands create an empty database in a copy that has none. The rename
  moves one with no issue, no memory and no prefix of its own to
  `.beads/set-aside-<stamp>/`; one holding anything, or one bd cannot
  answer for, stops it before any change.
- **The tracker steps never push.** `bd init` commits the beads files; the
  CLI undoes that commit (keeping the changes) so the owner commits the
  rename as one change.
- **The bootstrap's progress is committed.** `.bootstrap/state.json` travels
  with the repo; only `pnpm bootstrap:state` writes it. A state that is not
  one stops the command: never guess which steps ran. The fills and skill
  tests read it, so it stays after the bootstrap finishes.
- **The rename and its copy check go once the bootstrap finishes** (the
  skill's _Finishing_); the state CLI and its tests stay.
- Node built-ins only; Node runs the source directly (relative imports end in
  `.ts`, erasable syntax only).
