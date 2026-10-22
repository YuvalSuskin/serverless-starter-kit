# docs/superpowers/plans/

Implementation plans: how a design in `docs/superpowers/specs/` is built,
task by task. The `superpowers:writing-plans` skill writes them; these rules
come from the owner and override the skill wherever they differ.

## Rules for every plan

- **A task is one full green run, then a commit.** Each task ends with
  `pnpm fix`, then `pnpm check` from the repo root, green (it is exactly CI,
  so Docker must be running for the backend's contract tests), then a commit,
  then the next task. Nothing is left red or uncommitted between tasks.
- **Tasks carry no full code.** They say what to build and how to know it
  works. Snippets are allowed only where a signature or type must match
  exactly between tasks, and stay short. Point at existing files to copy from
  instead of writing the code out.
- **Interchangeable decisions are the implementer's.** A choice where another
  option would serve as well (which icon library, a file name, a helper's
  shape) is made during the task, recorded in the feature's
  implementation-decisions doc in `docs/decisions/`, and work continues. Only
  a change a user would notice, a break of the design's principles, or an
  exception to the library guidelines goes to the owner.
- **`design/` outranks any mockup.** Colours, type and radii come from
  `@acme/design` (its one export, the tokens CSS), the font from
  `frontend/src/app/fonts.ts`, and the rules from `design/DESIGN.md`; a
  mockup decides only what those are silent on.
- **A UI task that should look like a mockup names it.** Its References
  list the mockup screens it matches, and its Done when includes the
  side-by-side comparison in `design/DESIGN.md`, "Aligning to a mockup or
  an inspiration", with before and after in the PR. Matching the mockup's
  flow alone does not finish such a task.
- **A task that adds a resource lists its fake, contract suite, seed and dev
  page,** and its meter if the service is paid (root `CLAUDE.md`, *Local
  first*). `pnpm check` enforces the fake, the suite and the wiring in
  `entries/dev` (the structure test); the seed, the dev page and the meter are
  reviewed, not checked.
- **UI tasks include mobile checks.** Many users are on phones; every task with UI
  names what to check on a phone viewport and with touch.
- **Every plan names its beads in its header:** a `**Beads:**` line within
  the first 15 lines (the epic, or the bead the plan builds). `pnpm sweep lint`
  fails without it, because the sweep finds executed plans by their beads'
  status (`docs/superpowers/specs/2026-09-30-sweep-design.md` §10).
- **Say why the tasks come in this order**, in one line near the top, so a
  reviewer can see the dependencies.

## Plan Structure

To prevent token bloat while maintaining autonomy, separate the plan into a global context section and lightweight individual tasks.

### 1. Global Context (Once at the top)
Map out the full architecture and requirements here so subagents don't need to read them repeatedly.

| Section | What it holds |
|---|---|
| **Product references** | The product spec's IDs the plan implements (places, affordances, states, rules, limits). Work with no user-visible effect says "none" |
| **Design references** | Design doc sections and decision IDs the plan relies on |
| **Packages** | **Must use**, with the reason. **Must not use**, where there is a trap. **New installs**: pinned exactly. |
| **Decisions** | The interchangeable choices expected, and what to escalate instead |

### 2. Task Details (Per task)
Keep tasks extremely lightweight. When delegating to a subagent, pass ONLY this task section.

| Section | What it holds |
|---|---|
| **Goal** | One sentence: what is true when the task is done |
| **References** | Product IDs and Design doc sections the task implements. **Provide file paths and section IDs only (e.g. `spec.md §2.1`)**. Do NOT copy-paste the spec text into the plan. |
| **Files** | Paths to create or modify, one line each on what the file is responsible for |
| **Interfaces** | What it consumes from earlier tasks and produces for later ones: names and signatures |
| **Follow these patterns** | Existing files to copy from, and the repo rules that apply |
| **Tests, written first** | Each test case and what it asserts |
| **Out of scope** | What not to build yet, so the task cannot creep into the next |
| **Done when** | `pnpm fix` and `pnpm check` green, any manual check, and the commit message |
