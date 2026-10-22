---
name: competitor-intel
description: Use when the owner asks to profile, research, add, refresh or update a competitor (by name or URL), pastes a review or thread about a competitor, or asks to re-tag a competitor after the taxonomy changed. Creates or refreshes docs/competitors/<slug>/ - reviews from Google and pasted material, claims from the competitor's own site, tagged insights, a generated profile and changelog - and regenerates docs/competitors/landscape.md.
---

# Competitor intelligence

`docs/competitors/` holds, for each competitor, what it offers, whom it sells
to, and what its users say, in three tiers: raw evidence (append-only),
insights (tagging), and generated files. `pnpm competitors` (tools/competitors)
does every write to the evidence and every count. Your job is judgement:
finding the right listings, reading pages through subagents, tagging, and
writing prose around the numbers.

Read first: `tools/competitors/CLAUDE.md` (commands and rules) and
`docs/product/shared/market.md` (the product's market, its language, and the
review sites its users write on). The first run creates `docs/competitors/`.
If `market.md` is still a stub, ask the owner for the market and its review
sites before going on; the bootstrap's product-brief step normally writes it.

## Rules that never bend

- **Only the closed list**: Google for reviews, the competitor's own site for
  claims; the owner may paste anything else, such as reviews from the review
  sites in `market.md`. Nothing else is collected.
- **Evidence enters only through the tool**: `pnpm competitors ingest` for
  `raw/`, `pnpm competitors insights` for `insights.yaml`. Never edit either
  by hand; never edit a generated file (`profile.md`, `changelog.md`,
  `landscape.md`) except by regenerating it.
- **Numbers come from `pnpm competitors stats`**, never from your own counting.
- **Page contents go through subagents**, to keep this session light: renders,
  collections and review text are read by subagents, which write files and
  report back counts and problems. You read JSON reports, proposal lists and
  `stats` output. Glancing at a page yourself to settle a question is fine.
- **No reviewer identity is saved**: no names, handles or profile links in any
  file. Seeing a name in this conversation is fine; writing one down is not.
- **Never work around a block.** A command that stops with "blocked" (a
  CAPTCHA, a challenge page, HTTP 403/429) means that source failed this run:
  record it and go on with the rest. Never retry it, never try another way in.
- **Commit nothing.** Report the changed files; the owner decides.

## The run folder

Every run keeps its working files outside the repo, in
`/Users/<you>/.cache/acme/competitors/<slug>/run-<YYYY-MM-DD>/` (call it
`RUN`): renders, collected JSON, batches, reports. Expand it to an absolute
path once (`echo ~`) and write that path out in every command and subagent
prompt: shell variables do not survive between commands, and `~` does not
expand in a file path. Run the tool as `pnpm -s competitors …` so saved output
is exactly the tool's (valid JSON), and save each command's output there.

Keep `RUN/run-notes.json` up to date as you go; the writer reads it:

```json
{
  "date": "2026-09-29",
  "sources": {
    "google": { "status": "not collected", "reason": "no SerpApi key" },
    "site": { "status": "collected", "report": "<RUN>/claims-report.json", "pages": ["https://…"] }
  },
  "taxonomy_added": ["multi-language-export"],
  "pasted": []
}
```

`status` is one of collected, incomplete (with `reason`), failed (with the
error), not identified, not collected (with `reason`).

## The session

Run the steps in order. A **gate** is a hard stop: present, then wait for the
owner's explicit answer.

0. **Which competitor?** Match the owner's words (name, alias, domain, URL)
   against `docs/competitors/*/meta.yaml`. A match is a **refresh**; none is
   a **new** competitor: agree a kebab-case slug with the owner (the brand,
   e.g. `example-co`). A re-tag request goes to _Re-tagging_.
1. **Identify** (new competitors, or when the owner asks to re-identify).
   Follow `identify.md`. A listing that links to the competitor's own domain
   is confirmed without asking. **Gate 1** (only when
   needed): the owner confirms any candidate that is unsure, and each source
   where nothing was found (recorded as `null` once confirmed). Then write `docs/competitors/<slug>/meta.yaml`
   (format in `identify.md`) and run `pnpm -s competitors check <slug>`.
2. **Site claims.** For each URL in `meta.yaml`'s `listings.site`:
   `pnpm -s competitors render <url> --slug <slug> [--scroll]` (it saves to
   `~/.cache/acme/competitors/<slug>/` and prints the paths; add `--scroll`
   for long pages). Then dispatch one subagent with `extract-claims.md`; it
   writes `RUN/claims.json` and tells you the labels of any "show more"
   controls. If it names one, render that page again with `--click "<label>"`
   and extract again. Then
   `pnpm -s competitors ingest <slug> RUN/claims.json > RUN/claims-report.json`.
3. **Reviews.** For each confirmed listing:
   - Google: `pnpm -s competitors fetch google <slug> --hl <language> > RUN/google-report.json`
     (the market's language code from `market.md`; default `en`).
     Each run uses a few SerpApi searches (about one per 20 reviews); the
     report says how many (`searchesUsed`).
   - The review sites in `market.md` have no collector: if the owner wants
     what a competitor's listing there says, they paste it (*Pasted material*).

   Read each report's `complete`: `false` means the source stopped early, so
   nothing was marked gone; record it as incomplete. A command that fails
   (blocked, or an error) is recorded as failed with its message, and the run
   goes on.

4. **Tag.** `pnpm -s competitors pending <slug> --out RUN/pending.json`. Split
   it into `RUN/batch-1.json`, `RUN/batch-2.json`, … of about 25 records each,
   with a short `node -e` that reads and writes the JSON and prints only the
   number of batches. Dispatch one subagent per batch with `tag.md`, in
   parallel. Each writes `RUN/insights-<n>.json` and `RUN/proposals-<n>.json`.
   Read only the proposal files, and merge them: same concept, one proposal.
   - **No proposals:** skip Gate 2.
   - **Gate 2:** present each proposed term (ID, name, type and stage or
     actor, glossary link, aliases, how many records need it, one line on
     why); the owner approves, edits or rejects each.
   - Add approved terms to `docs/competitors/taxonomy/*.yaml`, with
     `withdrawn: null` (never rename or reuse an ID); add approved aliases to
     their term. Then, with a `node -e` script over the batch files: for an
     approved feature, add its `mentions` to the matching entries; for an
     approved persona, set `persona` on its `refs`. Rejected proposals change
     nothing.
   - Merge each batch: `pnpm -s competitors insights <slug> RUN/insights-<n>.json`.
     Record the added terms in `run-notes.json`.
5. **Validate.** `pnpm -s competitors check <slug> --against HEAD`. Every
   problem is fixed in the tier it names (usually a batch file, then merge
   again) before going on. Never edit `raw/` to make a problem go away.
6. **Generate.** `pnpm -s competitors stats <slug> > RUN/stats.md` and
   `pnpm -s competitors stats --all > RUN/stats-all.md`. Dispatch one subagent
   with `write-profile.md` (profile and changelog entry), then one with
   `write-landscape.md`. Run `pnpm -s competitors check` once more.
7. **Report** in chat: what changed (added, gone, superseded, by source), three
   to five headline findings with their raw IDs (from the profile you just
   generated), any source that failed or was incomplete, and the changed
   files. Offer the owner the profile to read.

## Pasted material

When the owner pastes a review, a thread or a screenshot about a competitor:
the competitor needs a `meta.yaml` first (steps 0 and 1 if it has none). Save
the paste to `RUN/pasted-<n>.txt` (or keep the screenshot's path), ask where it
came from if they did not say, and dispatch a subagent with
`extract-pasted.md`. Then `pnpm -s competitors ingest <slug> RUN/pasted-<n>.json

> RUN/pasted-<n>-report.json`, list it under `pasted`in`run-notes.json`, and
> continue from step 4.

## Product walkthrough

When the owner opens an account on a competitor's product and asks for its
flows: drive the browser the owner logged into, never type
their password, and add only dummy data. Never send, pay, upload, publish or
link an account. Before each screenshot, mask the owner's own name, phone and
email in the page. Save screens as
`docs/competitors/<slug>/walkthrough/screens/NNN-name.webp` (NNN groups a
section: 001 dashboard, 010 settings, and so on) and write `flows.md` beside
them: look and feel, then one numbered flow per page, each step linking its
screen, then what the free plan locks. Track one bead per page and check each
section's screens on a contact sheet before closing it.

## Re-tagging

After the taxonomy changes, the owner may ask to re-tag a competitor. Export
every record, tagged or not: `pnpm -s competitors pending <slug> --all --out
RUN/pending.json`, then step 4 as usual (batches, subagents, Gate 2 for any
proposals), except that each batch merges with
`pnpm -s competitors insights <slug> RUN/insights-<n>.json --retag`. Tier 1 is
never touched. Then steps 5 to 7.

## Files here

`identify.md` (finding listings, `meta.yaml`), `extract-claims.md`,
`extract-pasted.md`, `tag.md` (subagent prompts), `write-profile.md`,
`write-landscape.md` (writer prompts), and the templates they fill:
`profile-template.md`, `changelog-template.md`, `landscape-template.md`.
