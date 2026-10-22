# Harness engineering — decisions

**Opened:** 2026-09-25, during the harness engineering research session
**Owner:** Yuval Suskin
**Research:** [`docs/research/2026-09-25-harness-engineering.md`](../research/2026-09-25-harness-engineering.md)

"Harness" means everything around the coding agent except the model. That
covers instructions, tools, checks, environments, and where knowledge lives.
This doc records what Acme decided to do about each, and what it
deliberately won't do.

The owner cares about four goals:

1. **Knowledge preservation** in the repo, including decisions that override
   earlier ones.
2. **Parallel development on one machine,** with several features in flight
   at once, each in its own worktree.
3. **Easy environment setup.**
4. **Quickly checking a branch end to end.** Saying "I want to check X" should
   set everything up.

The guiding constraint is **the lowest overhead that is proven, balancing
speed and stability**. Models keep improving and earn more trust over time.

Each decision is a bead labelled `decision` and `harness`. Several decisions
here are marked *provisional*: validate them against the full scaffold as it
grows.

> **Changed 2026-10-06.** Decisions now reach the owner in two ways. Between
> batches, through the owner's inbox page, a claude.ai artifact (its URL is
> recorded in the root `CLAUDE.md`): each item is a
> question with the agent's recommendation, and the owner answers it when
> they choose. Full drafts (specs, decisions with their reasons) go through
> review batches (`/review-batch`, `.claude/skills/review-batch/`). Either
> way, the agent applying the answer records the `Decided:` line here, posts
> the answer on the bead, and closes it. The paragraph above describes how
> the earlier H decisions were handled; a still-open one (H8) follows the new
> route when it is next due.

**Update, 2026-09-26:** the brainstorm settled H3, H4 and H9 (each section's
**Revised** or **Decided** paragraph). `pnpm preview` and the `/preview` skill
implement H2.

| # | Decision | Status |
|---|---|---|
| H1 | Operating principles | **decided** |
| H2 | Check branches locally, on demand; no preview deployment per PR | **decided**; built (`pnpm preview`) |
| H3 | Parallel worktrees on one machine | **decided** (revised 2026-09-26) |
| H4 | One-command environment setup | **decided** (revised 2026-09-26) |
| H5 | Where knowledge lives | **decided** |
| H6 | Superseding a decision | **decided** (protocol); not built |
| H7 | Code navigation: TypeScript language server, not graphify | **decided**; narrowed by [S1](2026-09-30-sweep-decisions.md) (Graphify for the sweep only) |
| H8 | Enforce the generated-files rule with a hook | proposed |
| H9 | Agent verification against the same URL the owner checks | **decided** (2026-09-26) |

---

## H1 — Operating principles

**Decided:** 2026-09-25, Yuval Suskin.

- **Gates stay strict and cheap; inside them, trust the model.**
  - The gates are:
    - `pnpm check` in CI;
    - branch protection on `main`;
    - "rebuild leaves the tree clean";
    - a few hooks.
  - Everything else is the agent's judgement. As models improve, loosen what
    happens inside the gates, not the gates themselves.
- **Enforce rules with tooling, not prose.**
  - `CLAUDE.md` is advisory. Anything that must hold goes into a lint rule,
    test, hook or CI job.
  - Lint and hook messages say *how to fix* the problem.
- **Ratchet.** Add a rule, a line in `CLAUDE.md`, or a tool only after an
  agent actually made that mistake. Never add them speculatively.
- **Design for deletion.** Each harness piece exists because of a model
  weakness. When a hook or rule is added, its comment says which failure it
  prevents. Re-check the list when models change, and delete what no longer
  earns its place.
- **The repo is the system of record.** A decision made in chat, Slack or
  someone's head doesn't exist for an agent until it is in the repo or in
  beads.

---

## H2 — Check branches locally, on demand; no preview deployment per PR

**Question.** How does the owner check a feature end to end before merging?

**Context.** Per-PR preview deployments are common, but for Acme they
aren't cheap. D4 points at SST and OpenNext on AWS, and a live stack per PR
would also need a backend and data per PR.

**Decided:** 2026-09-25, Yuval Suskin.

- **Local and on demand:** "I want to check `<branch | PR # | bead id>`" sets
  up everything on this machine:
  - the worktree;
  - dependencies;
  - env files;
  - the servers;
  - a named local URL, opened in a browser.
- **No per-PR remote previews.**
- The shape of that command: `pnpm preview` and the `/preview` skill.
- **Building blocks already exist:**
  - `claude --worktree "#123"` creates a worktree from a PR.
  - The desktop app creates worktrees and has a browser pane.
  - H3 and H4 below supply the named URL and the setup step.

---

## H3 — Parallel worktrees on one machine

**Question.** How do several feature worktrees run side by side without
colliding?

**Context.** A worktree isolates files only. These still collide:

- **Ports.**
- **Cookies.** They are scoped by host, not port, so `localhost:3000` and
  `localhost:3001` share logins.
- **Gitignored env files,** which a new worktree doesn't have.
- **Installed dependencies.**
- **Backend state,** such as databases.
- **The Playwright port. This is already a real bug.**
  `frontend/playwright.config.ts` pins port 3100 with
  `reuseExistingServer: !isCI`. So `pnpm e2e` in a second worktree silently
  tests the *first* worktree's server.

**Decided (provisional, direction agreed):** 2026-09-25, Yuval Suskin.

| Collision | Direction |
|---|---|
| Ports and cookies | **portless** (Vercel Labs). `portless run next dev` serves `https://<name>.localhost`. In a linked worktree it prefixes the branch as a subdomain, so each worktree gets its own URL and its own cookies. It picks a free port and sets `PORT` and `PORTLESS_URL`. |
| Env files | **`.worktreeinclude`** (Claude Code). Gitignored files that match it are copied into every worktree Claude Code creates, including the desktop app's. |
| Dependencies | pnpm's content-addressed store. `pnpm install --frozen-lockfile --prefer-offline` in a new worktree takes seconds. |
| Backend state | **Open.** The candidates are a Compose project per worktree (`COMPOSE_PROJECT_NAME`) or one server with a database per branch, with connection strings derived from the branch name. Decide against the backend scaffold. |
| Playwright | Take `baseURL` and the server from the environment (the worktree's URL), so parallel runs never cross. |

**Risks and fallbacks.** portless is pre-1.0; the fallback is a port derived
from a hash of the branch name. Safari needs `/etc/hosts` entries for
`.localhost` subdomains; Chrome, which the Claude browser pane uses, does not.

**Validate after the backend merge:**

- how many services a worktree runs;
- whether the API gets its own subdomain (`api.<branch>.acme.localhost`);
- how backend state is isolated.

**Revised:** 2026-09-26, Yuval Suskin.
Fixed port pairs and `*.localhost`, **not portless**: web on `4300 + 2n`, API on
the next port, `http://<slug>.localhost:<web>`. That means no proxy daemon and
no locally trusted certificate authority; Chrome resolves `*.localhost` itself
and keeps each host's cookies apart. Backend state per worktree is solved by the
backend scaffold's in-memory fakes, so there is no database per worktree. The
two hard-coded 8787s became one `DEV_API_PORT`, and the Playwright port bug is
fixed (`E2E_PORT`, no reusing another worktree's server).

---

## H4 — One-command environment setup

**Question.** How does a fresh clone, or a fresh worktree, get to a running
app?

**Decided (provisional, direction agreed):** 2026-09-25, Yuval Suskin.

- **One toolchain file.** The candidate is `mise.toml`, pinning:
  - Node, reconciled with the existing `.nvmrc`, which currently holds
    24.21.0;
  - Python, for `design/` builds;
  - `typescript-language-server` (H7).

  pnpm stays pinned through `packageManager`.
- **One idempotent setup command,** run the same way by people and agents. It:
  1. checks the tools;
  2. installs dependencies;
  3. copies example env files that are missing;
  4. does the portless one-time trust step;
  5. prints the URL.
- **CI runs the setup command on a clean runner.** This is the same "rebuild
  from nothing" principle `design/` already follows.
- **Frontend-only worktrees never need Python,** because `design/` output is
  committed.
- **Not now: devcontainers or Nix.** Reconsider only if the backend's services
  make local setup genuinely painful.

**Revised:** 2026-09-26, Yuval Suskin.
No version manager: `.nvmrc` and `packageManager` already pin Node and pnpm.
`pnpm preview doctor` checks the machine and prints the fix for each gap; CI's
`preview-smoke` job runs the tool on a clean runner. *Since CI17 (2026-10-16, `docs/decisions/2026-10-06-ci-decisions.md`) `pnpm check:full` runs that smoke test on this machine instead; no clean runner does.*

---

## H5 — Where knowledge lives

**Question.** Where does each kind of knowledge go, so it is found and
doesn't go stale?

**Decided:** 2026-09-25, Yuval Suskin. There are four places, each with one
job:

| Where | What it holds | Rule |
|---|---|---|
| Component `CLAUDE.md` | *How to work here*: commands, conventions, gotchas | Short. The root file is a map to the component files. A line is added only after a real mistake (the H1 ratchet). The test for each line: would removing it cause a mistake? |
| `docs/decisions/<date>-<area>-decisions.md` plus decision beads | *Why*: question, context, options, the decision | The existing convention: `Decided:` in the doc, full record in `bd comments <id>`. |
| Beads | Work, plans (`--design`, `--acceptance`), follow-ups (`discovered-from`) | This covers what OpenAI keeps in an `exec-plans/` folder. |
| `bd remember` | Workflow knowledge that cuts across components | Keep it tiny, because it is injected into every session. Anything about a single component is promoted into that component's `CLAUDE.md`. |

Research that informs decisions goes in `docs/research/`. Agents read it only
when they need it.

**Also decided:**

- **No per-decision ADR files.** An ADR folder was considered, but the
  existing area docs plus decision beads already cover it. A second store
  would itself go stale.
- **`CLAUDE.md` is the only instruction file.** There is no `AGENTS.md`: the
  repo is Claude Code only (commit `b74ad55`). Never auto-generate it with
  `/init`. The 2026 ETH study found that LLM-generated context files slightly
  lowered agent success and added 20–23% to cost.

---

## H6 — Superseding a decision

**Question.** When the direction changes, how do we make sure the old
decision is visibly dead and nothing still follows it?

**Context.** Overridden decisions fail in three ways:

1. The old record still looks live.
2. What came out of it isn't updated: `CLAUDE.md` lines, rules, `bd remember`
   memories and code still follow it. When instructions conflict, Claude may
   follow either.
3. The reversal happened in chat and was never recorded.

Beads has the primitives:

- `bd create --type decision`;
- `bd supersede <old> --with <new>`, which closes the old bead and links the
  replacement;
- `bd history <id>`, versioned in Dolt;
- `bd query` for live decisions.

What beads does *not* do is find the old decision's traces elsewhere in the
repo.

**Decided:** 2026-09-25, Yuval Suskin. The model is an **append-only log plus
current state**, the same idea as ADRs and event sourcing:

- **The log is never rewritten.** A new decision says what it supersedes. D3
  in the frontend decisions doc already does this by hand: "Likely answer
  (superseded, see Decided)".
- **Current state is edited in place.** `CLAUDE.md`, rules and docs describe
  only what is true now.
- **ID anchors.** A line in current-state docs that follows from a decision
  cites that decision's bead id, for example
  `(<bead-id>)`. Finding everything an old decision affected is then
  `grep <old-id>`.
- **The protocol,** to be packaged as a `/decide` skill:
  1. create the decision bead, including "Supersedes: X, because …";
  2. run `bd supersede X --with Y`;
  3. grep for X and point every hit at Y;
  4. update or `bd forget` memories that encode X;
  5. open `discovered-from: Y` beads for code that must change.
- **Two guards cover decisions made in chat:**
  - a `CLAUDE.md` rule that owner decisions are recorded as decision beads
    before they are implemented;
  - a "did any decision change?" question in the session-close protocol.
- **Optional, later:** a pre-push check that fails when docs cite a
  superseded bead.

---

## H7 — Code navigation: TypeScript language server, not graphify

**Question.** Do agents need a code knowledge graph, such as graphify, to
find their way around?

**Decided:** 2026-09-25, Yuval Suskin. **No graphify.**

**Why not graphify:**

- The codebase is TypeScript only, so the compiler already has the dependency
  graph.
- graphify's value is in large, multi-language repos and non-code sources.
- It keeps only a current snapshot, with no history or supersession, so it
  would repeat stale docs as fact.
- It adds LLM extraction cost, a committed graph file that changes on every
  commit, and hooks that change how the agent searches.

**What we do instead:**

- **Give the agent the compiler's view:** Anthropic's official `typescript-lsp`
  plugin. It gives symbol navigation (go-to-definition, find-references) and
  type errors after every edit. Enable it for the team through
  `enabledPlugins` in `.claude/settings.json`, and install the binary through
  H4. It works in local sessions only.
- **Keep the gaps typed:**
  - The frontend ↔ backend boundary uses shared zod contracts, already decided
    in D7.
  - Environment variables are parsed once, at the boundary.
  - Next.js file-based routes and design tokens aren't imports; they are
    pointed to from `CLAUDE.md`.
- **Structure is enforced, not described:** knip and `eslint-plugin-boundaries`
  already run in `pnpm check`.

**Revisit if** the repo grows until agents burn noticeable context finding
their way around, or if non-code knowledge (PDFs, external specs) needs
ingesting.

---

## H8 — Enforce the generated-files rule with a hook

**Question.** The root `CLAUDE.md` says `design/tokens/tokens.css` is build output and must never be hand-edited. How
is that enforced?

**Proposed:** a `PreToolUse` hook on `Edit|Write` that denies those paths.

- The deny is exit code 2, or `permissionDecision: "deny"`.
- The message names the build script to run instead.
- This is the H1 principle ("enforce with tooling, not prose") applied to an
  existing rule. It is about 10 lines.
- Hook gotcha: **only exit code 2 blocks.** Exit code 1 is a non-blocking
  error.

---

## H9 — Agent verification against the same URL the owner checks

**Question.** How do the agent and the owner verify the same running branch?

**Decided (provisional):** 2026-09-25, Yuval Suskin.

- Playwright's `baseURL` comes from the worktree's URL (H3). The agent runs
  e2e against exactly what the owner opens.
- For UI changes, the agent attaches evidence to the PR: Playwright
  screenshots or traces. The owner reviews behaviour first and the diff
  second.
- **Considered, not adopted now:** a separate evaluator subagent with
  read-only tools. Anthropic found that generators grade their own work too
  generously. Reconsider if agent-reported "done" keeps proving false.

**Decided:** 2026-09-26, Yuval Suskin.
`E2E_BASE_URL=<preview url> pnpm --filter @acme/frontend exec playwright
test` runs the smoke tests against a running preview; the `/preview` skill tells
agents to preview their own UI work that way and attach screenshots to the PR.

---

## Deliberately not doing

| Not doing | Why | Revisit when |
|---|---|---|
| Per-PR remote preview deployments | Cost; H2 covers the need locally | A non-developer needs to review from their phone |
| graphify or another code knowledge graph | H7 | The repo is large and navigation burns context |
| OpenAI's full `docs/` tree, quality-score docs, scheduled cleanup agents | Built for about 1M lines of code and 7 engineers | Docs start drifting from code; then add a weekly doc-gardening routine first |
| Minimal merge gates with auto-merge | Only safe with heavy automated verification and cleanup behind them | — |
| Devcontainers or Nix | Heavier than H4 needs | Backend services make local setup painful |
| `AGENTS.md`, auto-generated `CLAUDE.md` | H5 | Another agent tool is adopted |
| Many MCP servers | Each one inflates every prompt, and they are a supply-chain risk; CLIs cover the needs | A capability has no CLI |
