# Step 1: Basics

The project's name, its domain, its language and market, and where its data
lives. Everything else builds on these.

**Needs:** a fresh copy of the template with a clean worktree, `bd` on the
PATH, Node 24 (`node -v`).

**Fills:** `<project>`, `<domain>`, `<region>` (`fills.json` lists their files).

## Asks

One question per message, in this order; skip what the decisions log
already answers.

1. **The display name**, as users will read it (any script, up to 50
   letters, digits and inner spaces).
2. **The slug**: lowercase letters, digits and single hyphens, starting with
   a letter. Offer one made from the name. It names the packages, the AWS
   resources, the beads prefix and the folders, so it is hard to change later.
3. **What it is, in one sentence**, for the top of the README and the root
   `CLAUDE.md`. The owner's words.
4. **The domain.** If none is registered yet: the one they intend to
   register. If that is not decided either, use `<slug>.example` as a stand-in
   and record it as provisional; when the real one comes, replace it in the
   files `fills.json` lists for `<domain>`.
5. **The language users read, and its direction** (left to right or right to
   left). One language; a second one is a later product decision.
6. **The market:** the country or region its users are in.
7. **The AWS region**, and **whether a rule binds where data lives** (a law, a
   customer contract, a promise). Recommend the region nearest the market that
   runs the services `infra/aws/README.md` lists under _What the region and
   the SCP allow_; say if it is an opt-in region. With no binding rule, the
   region still holds all the data (decision A3); the answer only changes how
   the rule is worded.

## Writes

- **The rename,** only while the repo root still holds the template's marker
  file (the root file named by `MARKER` in the rename's `rename.ts`;
  `pnpm rename` deletes it). Run `pnpm rename <slug> "<Display Name>"`. It
  rewrites the placeholder name everywhere, runs `pnpm install`, initialises
  the tracker with the slug as prefix, imports the seed memories and files
  the two anchor beads (`tools/bootstrap/CLAUDE.md`). If it stops partway, it
  prints what is left: run `pnpm rename --resume`. With the marker gone, skip
  the rename: it has run. While the marker exists and `.beads/` holds no
  tracker database yet (a fresh copy), the SessionStart hook in
  `.claude/settings.json` skips `bd prime`, and the rename makes the hook plain;
  a tracker database something else created (the beads MCP server, a `bd`
  command run by hand) is set aside by the rename when it is empty (no issue,
  no memory, no prefix of its own) and stops it otherwise.
- **The tracker's remote,** right after the rename, only when it reported
  "bd set git's origin as its remote" (the copy came with a git `origin`, as
  GitHub's "Use this template" leaves it): settle it before the first
  `git push`, since until the remote holds the tracker the pre-push hook's
  `bd sync` fails and stops every push. Name the URL and ask whether it is the
  project's own repository and to keep it. Keeping it pushes the issues and
  memories to `refs/dolt/data` there: state that, wait for yes, then run
  `bd dolt push` once. Otherwise, or for a remote that is not the project's
  own, run `pnpm tracker:drop-remote` (it removes `sync.remote` and the Dolt
  remote and checks nothing is left; the hook's `bd sync --no-adopt` then
  skips) and commit `.beads/config.yaml`; step 3 sets a remote later. Record
  which in a BS row.
- **The README** (`README.md`): the title becomes the display name and the
  opening paragraph, which describes the template, becomes the one-sentence
  description and a line saying the project started from the template.
- **The root `CLAUDE.md`:** under "What this repo is", after "The <Name>
  monorepo.", the description, the language and direction, and the market, in
  one short paragraph. Under "Infrastructure", the first sentence names the
  region and the data rule: "Everything runs on AWS in `<the region>` …: data
  stays there because <the rule, or: the project keeps it in one region>".
  Leave the paragraph on the skeleton, which carries the `Skeleton:` marker,
  to step 6.
- **The fill tokens:** `<project>` with the slug, `<domain>` with the domain
  and `<region>` with the region, in every file `fills.json` lists for them,
  including `infra/aws/region-guardrail-scp.json` (the region guardrail SCP's
  two `aws:RequestedRegion` lists; if the region is `us-east-1`, that list
  keeps one entry). `deploy/accounts.json` is not touched here: step 7 writes
  it, all at once, from these answers.
- **The sentences that explain these placeholders,** reworded so they read
  right once filled: `docs/runbooks/deployment.md`'s second paragraph
  ("`<project>` is the project's name, `<region>` its AWS region and
  `<dev-account-id>` the dev account's ID; all three are bootstrap answers")
  names the project and its region plainly and keeps only
  `<dev-account-id>` as an answer still to come (step 7 removes the rest);
  `docs/decisions/2026-09-28-aws-account-decisions.md`'s paragraph saying
  `<region>` and `<project>` are bootstrap answers states the region and the
  name instead.
- **The decisions log,** `docs/decisions/YYYY-MM-DD-bootstrap-decisions.md`,
  created with its header (`SKILL.md`, _Decisions_).

The language and direction are applied to the app in step 5 and to the
product docs in step 2; this step records them only.

## Records

- BS rows: the name and slug; the domain (provisional or registered); the
  language and direction; the market; the region, and the data rule with its
  source, or "no binding rule: one region by A3"; the tracker's remote bd set
  from git's `origin`, kept or removed, when the rename reported one.
- If the data rule is stricter than the guardrail (it names services or
  copies the guardrail cannot stop, such as CloudFront's edge caches), a row
  saying so and a bead for the gap, labelled for the next review batch
  (`batch-1` in a fresh project; `SKILL.md` says how to pick `<n>`).

## Done when

- The marker file is gone, `.beads/` holds the project's tracker
  (`bd list` works), and `git grep -i` finds the template's placeholder name
  only where the rename's allowlist says (`rename.ts` in
  `tools/bootstrap/src/`).
- `git grep -F` finds none of `<project>`, `<domain>` or `<region>` outside the
  bootstrap's own files, tests and the template-build log
  (`docs/decisions/2026-10-21-template-build-decisions.md`), which talk about them.
- The README and the root `CLAUDE.md` name the project, its language, market
  and region.
- The decisions log exists with this step's rows.
