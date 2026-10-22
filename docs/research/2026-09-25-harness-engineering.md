# Harness engineering — research

**Date:** 2026-09-25
**Beads:** `acme-r8n` (inherited research; the template tracker's anchor for it)
**Decisions this informed:** [`docs/decisions/2026-09-25-harness-decisions.md`](../decisions/2026-09-25-harness-decisions.md)

This compiles two independent research passes. Key claims were spot-checked
against their primary sources; ✓ marks claims verified this way, and the last
section lists what is second-hand. Figures are as reported on 2026-09-25. The
field changes monthly, so re-check the figures before relying on them.

## 0. One-paragraph answer

**Harness engineering** is the work of building the environment around a coding agent: context, tools, constraints, feedback loops and cleanup. The goal is that the agent does reliable work without a human writing code. The term comes from Mitchell Hashimoto: "anytime you find an agent makes a mistake, you take the time to engineer a solution such that the agent never makes that mistake again". OpenAI made it widely known in February 2026.

For a repo, the harness comes down to six layers:

1. a **short instruction file** that works as a map;
2. a **versioned knowledge base** it points into;
3. **capabilities**: skills, scripts, the app bootable per worktree, logs and metrics the agent can query;
4. **deterministic sensors**: linters with remediation text, structural tests, types, hooks, CI;
5. **durable state**: plans, progress, issues;
6. **entropy control**: golden principles, scheduled agents that clean up drift.

The main shift is from *prose you hope the agent follows* to *mechanisms that make the wrong thing fail fast*.

---

## 1. The OpenAI post (Ryan Lopopolo, Feb 11 2026)

The post describes a 5-month experiment:

- **Scale:** about 1M lines of code, about 1,500 merged PRs, 3 engineers growing to 7, about 3.5 PRs per engineer per day, **zero hand-written code**. Throughput went *up* as the team grew. Single agent runs often lasted more than 6 hours.
- **The engineer's job:** "design environments, specify intent, and build feedback loops". When the agent fails, the question is never "try harder". It is: *"what capability is missing, and how do we make it both legible and enforceable for the agent?"*, and the agent writes the fix.
- **The review loop:** the agent reviews its own changes, asks for extra agent reviews (local and cloud), responds to feedback, and iterates until the agent reviewers are satisfied (a "Ralph Wiggum loop"). Human review is optional; most review is agent-to-agent.

### Making the application legible to the agent

- The app is **bootable per git worktree**, so each change gets its own isolated instance.
- The Chrome DevTools Protocol is wired into the agent runtime (a diagram in the post shows it as Chrome DevTools MCP), with **skills** for DOM snapshots, screenshots and navigation. The loop is: snapshot before, trigger the UI path, snapshot after, observe runtime events, fix, restart, and re-validate until the app is clean.
- **A local observability stack runs per worktree and is torn down after the task.** The app sends logs, metrics and traces to Vector, which fans them out to Victoria Logs, Metrics and Traces; this detail comes from a diagram in the post. The agent queries them with LogQL, PromQL and TraceQL. That turns goals like "startup < 800ms" or "no span > 2s in these 4 journeys" into prompts the agent can act on.

### The repo as system of record ("a map, not a 1,000-page manual")

The "one big AGENTS.md" approach failed in four ways:

- it crowds out the context;
- when everything is important, nothing is;
- it goes stale immediately;
- it can't be checked mechanically.

What worked instead is an **AGENTS.md of about 100 lines that serves as a table of contents** pointing into `docs/`:

```
AGENTS.md
ARCHITECTURE.md                 # matklad-style: codemap, invariants, layer boundaries
docs/
├── design-docs/  (index.md, core-beliefs.md, …)   # catalogued, with verification status
├── exec-plans/   (active/, completed/, tech-debt-tracker.md)
├── generated/    (db-schema.md)
├── product-specs/ (index.md, …)
├── references/   (*-llms.txt for key deps)
├── DESIGN.md  FRONTEND.md  PLANS.md  PRODUCT_SENSE.md
├── QUALITY_SCORE.md   # grades each domain/layer, tracks gaps
├── RELIABILITY.md  SECURITY.md
```

- **Linters and CI keep the knowledge base in shape.** They check that it is current, cross-linked and correctly structured.
- **A recurring "doc-gardening" agent opens PRs** that fix documentation which has drifted from the code.
- **What the agent can't see doesn't exist.** Slack threads, Google Docs and knowledge in people's heads must be moved into the repo.
- **"Boring" technologies are preferred.** They are composable, their APIs are stable, and they are well represented in training data. Sometimes the team reimplemented a small dependency so the agent could reason about all of it (for example their own map-with-concurrency helper instead of p-limit).

### Enforcing architecture and taste

- **Enforce invariants, not implementations.** One example is "parse data shapes at the boundary", which does not dictate a library.
- **Fixed layers per domain:** Types → Config → Repo → Service → Runtime → UI. Cross-cutting concerns enter only through **Providers**. Custom linters and structural tests enforce this.
- **"Taste invariants" are lint rules:** structured logging, naming conventions for schemas and types, **file size limits**, and reliability rules.
- **Custom lint error messages include remediation instructions** for the agent.
- Rules are enforced at the boundaries; within them, the agent has freedom.
- Human taste comes back through review comments and bugs. It becomes docs first, then gets **promoted into code** when the docs aren't enough.

### Merge philosophy

- Few blocking gates and short-lived PRs.
- Flaky tests get re-run rather than blocking.
- The team says outright that this "would be irresponsible in a low-throughput environment".

### Entropy and garbage collection

- **The agent copies whatever patterns exist, bad ones included.** At first the team spent every Friday (20% of the week) cleaning up "AI slop".
- **Now they encode "golden principles"**, for example "shared utils over hand-rolled helpers" and "no YOLO probing of data; validate or use typed SDKs".
- **Background agents run on a schedule.** They scan for deviations, update quality grades and open small refactor PRs. These take under a minute to review and are often automerged.

### Linked templates

| Link | What it is |
|---|---|
| ExecPlans (OpenAI Cookbook) | AGENTS.md says to use an ExecPlan (per `.agent/PLANS.md`) for complex features and significant refactors. Required sections: Purpose, Context & Orientation, Plan of Work, Concrete Steps, Validation & Acceptance, Idempotence & Recovery, Progress (timestamped checkboxes), Surprises & Discoveries, Decision Log, Outcomes & Retrospective. Rules: self-contained, a living document, readable by a novice, outcomes observable. |
| matklad's ARCHITECTURE.md | Bird's-eye view, a codemap ("a map of a country, not an atlas"), named entities that can be found by symbol search (not links), invariants (especially *absences*), layer boundaries, cross-cutting concerns. Short; revise it twice a year. |
| Logic.inc, "AI is forcing us to write good code" | 100% coverage treated as a to-do list; many small, well-named files; tests in about 1 minute; fresh environments in 1–2 seconds with isolated ports and databases so several can run at once; end-to-end types (semantic names like `UserId`); auto-fixing linters. |
| "Parse, don't validate" | Validate at the boundary and turn raw data into types. |

---

## 2. What the rest of the field says

### Definitions

| Framing | Who |
|---|---|
| Agent = Model + Harness; everything that isn't the model is the harness | Böckeler/Fowler, Addy Osmani, Faros |
| The *outer harness* that users build: **guides** (feedforward) plus **sensors** (feedback), each either **computational** (deterministic) or **inferential** (an LLM judge) | Böckeler, martinfowler.com, Apr 2026. This is the most useful mental model. |
| A subset of context engineering, using the config surface (CLAUDE.md, MCP, skills, subagents, hooks) | HumanLayer, "Skill Issue" |
| The layer after prompt engineering (2022–23) and context engineering (2024–25) | Faros |

### Principles most sources agree on

1. **Keep the root file short.** OpenAI about 100 lines; Anthropic docs under 200 per file; HumanLayer under 60 (and under 300 at most); Osmani about 60.
2. **Progressive disclosure.** Pointers, `file:line` references and topic docs rather than pasted content. Load path-scoped rules and skills on demand.
3. **Deterministic enforcement over prose.** "Never send an LLM to do a linter's job." CLAUDE.md is *advisory*; hooks, CI and lint are *enforced*.
4. **Fast, quiet back-pressure.** Checks stay silent when they pass and print only failures, with remediation text. Use a single `check` command and a fast targeted test runner. LangChain went from 52.8% to 66.5% on Terminal-Bench 2 by changing only the harness.
5. **Ratchet.** Every rule traces back to an observed failure; delete rules that newer models no longer need.
6. **Durable state outside the context window.** Plans, progress logs, feature lists and git history. Anthropic's long-running harness uses `init.sh`, `claude-progress.txt`, a JSON feature list, and one feature per session.
7. **Separate the generator from the evaluator.** Self-evaluation is too lenient. Anthropic's planner→generator→evaluator setup has the evaluator test the running app with Playwright.
8. **Clean up drift continuously**, on a schedule, rather than in big bursts.
9. **Make the code easy to harness.** Fewer stacks, standard topologies and strict boundaries shrink the space the agent can go wrong in.
10. **Isolate context with subagents.** Keep context use at about 40–60% (HumanLayer).
11. **Few tools, and vetted.** Prefer CLIs over many MCP servers. Audit third-party skills and MCP servers, since their descriptions are injected into the prompt.

### Evidence and disagreements

- **The ETH study "Evaluating AGENTS.md"** (arXiv 2602.11988, v2 June 2026):
  - LLM-generated context files *slightly hurt* resolution rates (−0.5% on SWE-bench, −2% on their CTXbench).
  - Human-written files helped by about +2.4% on average.
  - Context files add 2–4 steps and **raise cost by 20–23%**.
  - Agents *do* follow the instructions, but files don't work well as overviews.
  - The paper's recommendation: don't auto-generate the file (`/init`), and write only what isn't already in the README or discoverable from the code.
- **Instruction budget.** IFScale shows that following instructions degrades as their number grows, and earlier instructions are favored. The often-quoted "~150–200 instructions" figure is HumanLayer's reading of that paper, not a number from it.
- **"Context rot"** (Chroma) and **"lost in the middle"** research support short files. Their tension with Codex's 32 KiB concatenation cap is unresolved.
- **Guides are unreliable.** Böckeler found that telling the agent "check sensors" was unreliable. Sensors have side effects:
  - max-lines rules led to chains of tiny components;
  - the agent sometimes *raised the threshold* instead of refactoring;
  - mutation testing caught weak assertions that 100% coverage missed.
- **Behavior is the least mature part of the harness.** Overengineering, misdiagnosis and misunderstood intent are not reliably caught by any guide or sensor.
- **Dex Horthy, "harness engineering is not enough"** (July 2026): lights-off "software factories" pile up architectural debt within months, because RL rewards passing tests, not maintainability. His answer is that humans still read plans and design and review code at important points. (Seen second-hand only.)
- **Harness parts expire.** Anthropic: "Every component in a harness encodes an assumption about what the model can't do on its own." Sonnet 4.5 needed context resets. **Opus 4.5** "largely removed" context anxiety, so resets were dropped. **Opus 4.6** made sprint decomposition unnecessary. ✓ Re-test your scaffolding as models improve.
- **Automated harness evolution** (arXiv 2604.25850) raised Terminal-Bench 2 pass@1 from 69.7% to 77%. The finding: "factual harness structure transfers while prose-level strategy does not." That is more evidence for structure over prose.
- **What real repos contain** (2,853-repo study): mostly just a context file. Skills and subagents are rare.

---

### Further sources and evidence

- **Builder harness vs user harness** (Böckeler). The builder harness is the loop, tools and system prompt shipped inside Codex, Claude Code or Cursor. The user harness is what your team adds: AGENTS.md, skills, hooks, lints, tests and review agents. A repo only controls the *user* harness.
- **Harness effects are large but depend on the setup.**
  - SWE-agent's interface raised SWE-bench Lite from 11.0% to 18.0% (peer-reviewed).
  - CodeAct gave up to 20% higher success (peer-reviewed).
  - ✓ Endor Labs: GPT-5.5 scored 61.5% on functionality in Codex vs 87.2% in Cursor, the same model in the same week.
  - Aider's edit-format change took GPT-4 Turbo from 20% to 61%.
  - The "hashline" edit-format result did **not** replicate cleanly across languages.
- **Counter-evidence: the model still matters more.** ✓ The Agents' Last Exam team's blog "Does the Harness Matter?" (agents-last-exam.org/blogs/harness-matters): "the model accounts for about 3× the pass-rate spread of the harness" (models span 18 points, harnesses 5–6). That is a general-agent benchmark, not coding.
  - Anthropic found that infrastructure configuration alone moves Terminal-Bench 2 scores by about 6 points, so treat leaderboard gaps under about 3 points as noise.
  - METR's 2025 randomized trial: developers took 19% *longer* while believing they were 20% faster. Measure outcomes, not how fast it feels.
- **Cursor ("Continually improving our agent harness", Apr 2026).**
  - Most of their late-2024 guardrails are gone, replaced by dynamic context the agent fetches itself.
  - They A/B test harness variants online and track **Keep Rate**: the share of agent code still present after N weeks.
  - They treat tool-call errors like SRE, by category, and reached 2–3 nines.
  - They tune edit tools per model: patch-style for OpenAI models, string replace for Claude.
- **Stripe Minions.** More than 1,300 fully agent-written PRs per week, **every one human-reviewed**.
  - Pre-warmed devboxes spin up in about 10 seconds.
  - Agents get curated subsets of about 500 internal MCP tools.
  - "Blueprints" interleave deterministic nodes (lint, test, push) with agentic ones.
  - CI retries are capped at 2.
- **Cognition (2026 update): single-writer multi-agent.** Additional agents should contribute intelligence (review, research, evaluation), not writes.
- **Anthropic's `cwc-long-running-agents` repo.** A "default-FAIL contract" plus a fresh-context evaluator subagent that has **no Write/Edit tools**.
- **Sandboxing cut permission prompts by 84%** in Anthropic's internal use (vendor figure).
- **Design for deletion.** Tag every harness component with the model weakness it compensates for, so it can be removed when that weakness goes away. Boris Cherny, reportedly: "features we hope that we will get rid of in three months".
- **Minimal baselines are strong.** mini-swe-agent, about 100 lines and bash only, scores above 74% on SWE-bench Verified (self-reported). Tool sprawl is usually waste.


## 3. What a repo needs: the checklist

### A. Instructions (guides)

- [ ] **One root instruction file of 60–150 lines, written by a human.** It is a *map*, not a manual. It covers:
  - what the repo is (one line per component);
  - the exact build, test, lint and check commands;
  - non-standard tooling (for example "use pnpm, not npm");
  - hard rules that can't be enforced mechanically *yet*;
  - pointers to deeper docs.

  Test each line with: "would removing this cause a mistake?"
- [ ] **Leave out** anything the agent can infer from the code, directory trees, generic advice ("write clean code"), and style rules a formatter already enforces.
- [ ] **Nested instruction files** in each major component (monorepo), loaded when the agent works there.
- [ ] **Path-scoped rules** for areas with specific constraints: `.claude/rules/*.md` with `paths:` frontmatter.
- [ ] **`ARCHITECTURE.md`**: codemap, invariants (especially "X never depends on Y"), layer boundaries, cross-cutting concerns.
- [ ] **`docs/` as the system of record**: design docs with an index and verification status, product specs, generated references (DB schema), `*-llms.txt` for key dependencies, and a core-beliefs or golden-principles file.
- [ ] **Decisions made in Slack, meetings or people's heads get written into the repo.**

### B. Capabilities

- [ ] **Skills** for repeatable procedures: deploy, release, debugging a subsystem, driving the UI, querying logs. Each is a SKILL.md with a sharp `description`; keep the body under 500 lines and put detail in reference files and scripts.
- [ ] **Scripts and CLIs over MCP where possible.** Where MCP is needed, commit a project `.mcp.json` with a few vetted servers.
- [ ] **The app is bootable per worktree**, with isolated ports and databases, via one command (`init.sh` or similar).
- [ ] **A browser the agent can drive**: Playwright or Chrome DevTools, for UI checks, screenshots and reproducing bugs.
- [ ] **Observability the agent can query**: logs and metrics per worktree.
- [ ] **Subagents** (`.claude/agents/*.md`) for jobs that isolate context: a code reviewer, a researcher or explorer, and an evaluator or QA agent separate from the generator. Give reviewer and evaluator subagents **read-only tools** (`tools: Read, Grep, Glob, Bash`, no Edit/Write), which is the single-writer pattern. Calibrate them with examples of good and bad work.
- [ ] **Require evidence before "done":** test output, screenshots or query results, not the agent's own claim.

### C. Sensors (enforcement)

- [ ] **A single `check` command** that CI also runs. It is fast, silent when things pass, and shows only failures.
- [ ] **Type checking end to end**, with data parsed at the boundaries.
- [ ] **Custom lint rules for architecture:** dependency direction, layer rules, file and function size, structured logging, naming. **Error messages include the fix.** Inline disables are banned or tightly limited.
- [ ] **Structural tests** that encode invariants.
- [ ] **Behavior tests** the agent can run itself: end-to-end or browser tests. Consider mutation testing when the tests are written by AI.
- [ ] **Doc linters and CI:** knowledge-base structure, cross-links, freshness, and that generated files haven't been hand-edited.
- [ ] **Hooks** (Claude Code; committed in `.claude/settings.json` with scripts in `.claude/hooks/`):
  - `PostToolUse` on `Edit|Write`: format and lint the changed file, and report only errors.
  - `PreToolUse`: block dangerous commands and protected paths (generated files, migrations, secrets) with `exit 2` or a `permissionDecision: "deny"`.
  - `Stop`: block the end of the turn until checks pass. Watch `stop_hook_active` to avoid loops; Claude Code forces the stop after 8 consecutive blocks.
  - `SessionStart` (matcher `compact` or `startup`): re-inject key state such as the current plan, active issue or branch.
  - Remember: **exit 1 does not block. Only exit 2 blocks.**
- [ ] **Git hooks and CI as the backstop** for everything above, so it applies to every agent and tool.

### D. State and memory

- [ ] **Execution plans in the repo** for complex work (`exec-plans/active` and `completed`, PLANS.md template), including a progress log and a decision log.
- [ ] **An issue or task tracker the agent can use from the CLI**, with a JSON-like format the agent is less likely to rewrite.
- [ ] **A tech-debt tracker and a quality-score document** that is updated over time.
- [ ] **Frequent small commits** so git history serves as memory.

### E. Entropy control

- [ ] **Golden principles**: opinionated rules that can be checked mechanically.
- [ ] **Scheduled cleanup agents**: doc gardening, pattern-deviation scans, quality-grade updates. Their PRs are small and quick to review.
- [ ] **Review the harness itself periodically.** Delete rules and scaffolding the current model no longer needs.
- [ ] **Keep a harness manifest.** Each hook, lint rule, skill and guardrail records *which failure it prevents* and *which model weakness it assumes*. Re-evaluate the list on every model upgrade.
- [ ] **Record outcome metrics:** revert rate, escaped defects, Keep Rate, human minutes per merged change. Don't rely on how productive the team feels.

### F. Safety and permissions

- [ ] **Commit `.claude/settings.json` with permissions:** `deny` rules for secrets and destructive commands, and `allow` rules for the safe, common commands (to reduce prompts).
- [ ] **Turn on the sandbox** where possible (filesystem and network allowlists).
- [ ] **Keep personal settings local:** `settings.local.json` and `CLAUDE.local.md` go in `.gitignore`.
- [ ] **Audit third-party skills, MCP servers and plugins** before enabling them.
- [ ] **Keep mandatory human review for high-blast-radius paths:** payments, auth, data migrations, security, and anything the whole product depends on. Stripe keeps human review on every PR even at 1,300 per week.

---

## 4. Claude Code specifics (verified against code.claude.com docs)

### CLAUDE.md and AGENTS.md

- **Load order.** Scopes load in this order: managed → user (`~/.claude/CLAUDE.md`) → project (`./CLAUDE.md` or `./.claude/CLAUDE.md` plus `.claude/rules/`) → local (`CLAUDE.local.md`). Files are **concatenated, not overridden**.
- **Ancestors load at launch.** Every CLAUDE.md from the filesystem root down to the working directory loads when the session starts.
- **Subdirectories load on demand.** A subdirectory's CLAUDE.md loads the first time a file there is read.
- **`@path` imports** nest up to 4 hops deep and **do not save context**, because imported files load at launch.
- **HTML block comments are stripped before injection**, so they are free for notes to humans.
- **Compaction:**
  - Survive: the root CLAUDE.md and unscoped rules (re-read from disk).
  - Lost until a matching file is read again: nested CLAUDE.md files and `paths:` rules.
  - Re-attached: invoked skills (up to 5k tokens each).
- **AGENTS.md (v2.1.277 and later):**
  - Read natively, but **only as a fallback** when no CLAUDE.md or CLAUDE.local.md exists in the working directory or above it.
  - Recommended cross-tool pattern: **AGENTS.md is the source of truth, and CLAUDE.md contains `@AGENTS.md` plus a small Claude-only section.** A symlink also works, but Claude's Edit/Write refuse to write through it and it breaks on Windows.
- **Codex** walks from the git root to the working directory, concatenating `AGENTS.override.md`, then `AGENTS.md` (deeper files override). It stops at a **32 KiB** default cap, and deep files are silently dropped.
- **AGENTS.md support across tools** covers 20+ of them: Codex, Cursor, Copilot, Gemini CLI, Jules, Aider, Zed, Windsurf, Devin and others.

### Skills

- **Location:** `.claude/skills/<name>/SKILL.md`, plus optional `references/`, `scripts/` and `assets/`. Commands and skills have merged; if both exist, the skill wins.
- **Frontmatter fields:**
  - Identity and triggering: `name`, `description` (with `when_to_use`; together they're truncated at 1,536 characters in the listing), `paths` (glob gating)
  - Invocation control: `disable-model-invocation`, `user-invocable`
  - Tools and model: `allowed-tools`, `model`, `effort`
  - Execution: `context: fork` (runs in a subagent), `hooks`, `arguments`
- **Dynamic context:** `` !`cmd` `` runs before the skill loads.
- **The skill listing budget is about 1% of the context window.** Triggering depends entirely on the description, so front-load the keywords users would say.
- **The Agent Skills open standard** (agentskills.io) is supported by Codex, Gemini CLI, Copilot, Cursor, Amp and others. Portable fields: `name` (≤64 chars, lowercase with hyphens, must match the directory), `description` (≤1,024), `license`, `compatibility`, `metadata`, `allowed-tools`. Claude-only keys break claude.ai and API uploads.

### Hooks

- **33 events.** The ones that matter most for a harness: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolBatch, Stop, SubagentStop, PreCompact, InstructionsLoaded, FileChanged, WorktreeCreate.
- **Handler types:** `command`, `http`, `mcp_tool`, `prompt` (an LLM judge), `agent`.
- **Exit codes:** 0 means OK, and stdout is parsed as JSON. **2 blocks.** Any other code is a non-blocking error.
- **PreToolUse output:** `hookSpecificOutput.permissionDecision` accepts `allow`, `deny`, `ask` or `defer`. `additionalContext` is capped at 10k characters.

### Other primitives

- **Subagents:** `.claude/agents/*.md` with `name`, `description`, `tools`, `model`, `skills`, `isolation: worktree`, `hooks`, `memory` and more.
- **Permission precedence:** managed > CLI > local > project > user. Rules are evaluated **deny → ask → allow**, and the first match wins.
- **Plugins:** bundle skills, agents, hooks, MCP servers and output styles. A team commits `extraKnownMarketplaces` and `enabledPlugins` in the project settings.
- **Commit to the repo:** `CLAUDE.md`, `AGENTS.md`, `.mcp.json`, `.claude/{settings.json, rules/, skills/, agents/, hooks/, output-styles/}`.
- **Keep local:** `CLAUDE.local.md` and `settings.local.json`.

---

## 5. Anti-patterns

- **A generated (`/init`) root file** full of directory trees and overviews: measurably no better, and more expensive.
- **A monolithic instruction file:** it crowds out context, goes stale, can't be checked, and "everything important" means nothing is.
- **Enforcement written as prose:** "always run prettier" in CLAUDE.md instead of a hook or CI.
- **Hooks that exit 1** when they are meant to block.
- **Verbose check output** that floods the context on success.
- **Self-evaluation as the only QA.**
- **Knowledge kept in Slack, Docs or people's heads.**
- **Too many MCP tools, or unvetted ones.**
- **Many hard sensor rules added at once**, which can set off a spiral of over-engineered refactors.
- **Scaffolding that is never revisited** after a model upgrade.
- **Copying OpenAI's merge philosophy** (few gates, automerge) without its throughput and its garbage-collection agents.

---

## 6. What Acme decided

The decisions drawn from this research are recorded in
[`docs/decisions/2026-09-25-harness-decisions.md`](../decisions/2026-09-25-harness-decisions.md), items H1–H9.
The checklist in section 3 is the general menu. The decisions doc records what
Acme adopts, what it defers, and what it rejects.

## Sources

**Primary**
- OpenAI, "Harness engineering": https://openai.com/index/harness-engineering/
- OpenAI ExecPlans: https://developers.openai.com/cookbook/articles/codex_exec_plans
- matklad, ARCHITECTURE.md: https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html
- Logic.inc, "AI is forcing us to write good code": https://bits.logic.inc/p/ai-is-forcing-us-to-write-good-code
- Geoffrey Huntley, the Ralph loop: https://ghuntley.com/loop/

**Anthropic**
- Harness design for long-running apps: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Effective harnesses for long-running agents: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Effective context engineering: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Writing tools for agents: https://www.anthropic.com/engineering/writing-tools-for-agents
- Agent Skills: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

**Claude Code docs**
- Memory: https://code.claude.com/docs/en/memory
- Skills: https://code.claude.com/docs/en/skills
- Hooks: https://code.claude.com/docs/en/hooks
- Subagents: https://code.claude.com/docs/en/sub-agents
- Settings: https://code.claude.com/docs/en/settings
- Best practices: https://code.claude.com/docs/en/best-practices
- `.claude` directory: https://code.claude.com/docs/en/claude-directory

**Standards**
- AGENTS.md: https://agents.md/
- Codex AGENTS.md: https://learn.chatgpt.com/docs/agent-configuration/agents-md
- Agent Skills spec: https://agentskills.io/specification

**Commentary**
- Martin Fowler / Böckeler:
  - Harness engineering: https://martinfowler.com/articles/harness-engineering.html
  - Harness engineering memo: https://martinfowler.com/articles/exploring-gen-ai/harness-engineering-memo.html
  - Sensors for coding agents: https://martinfowler.com/articles/sensors-for-coding-agents.html
- Mitchell Hashimoto: https://mitchellh.com/writing/my-ai-adoption-journey
- HumanLayer:
  - "Skill Issue": https://www.humanlayer.dev/blog/skill-issue-harness-engineering-for-coding-agents
  - Writing a good CLAUDE.md: https://www.humanlayer.dev/blog/writing-a-good-claude-md
  - Advanced context engineering: https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md
- Addy Osmani: https://addyosmani.com/blog/agent-harness-engineering/
- Augment: https://www.augmentcode.com/guides/harness-engineering-ai-coding-agents
- Faros: https://www.faros.ai/blog/harness-engineering
- LangChain on Terminal-Bench: https://blog.langchain.com/evaluating-deepagents-cli-on-terminal-bench-2-0/
- InfoQ coverage: https://www.infoq.com/news/2026/02/openai-harness-engineering-codex/

**Research**
- ETH, "Evaluating AGENTS.md" (arXiv 2602.11988)
- Agentic Harness Engineering (arXiv 2604.25850)
- IFScale (arXiv 2507.11538)
- Chroma, Context Rot: https://www.trychroma.com/research/context-rot

**Unverified / second-hand:** the "150–200 instructions" figure, Horthy's quotes, the Opus 4.6 Terminal-Bench ranking claim, and the ETH significance values (taken from Augment's summary).
