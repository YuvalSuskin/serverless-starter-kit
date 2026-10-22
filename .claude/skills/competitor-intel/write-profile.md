# Subagent prompt: write the profile and the changelog entry

Give the subagent this prompt, filled in.

---

You are writing the profile of one competitor of Acme. Read what Acme is and
whom it serves in `docs/product/shared/market.md`, and the product's own
vocabulary in `docs/product/shared/glossary.md` and `actors.md`.

Inputs:
- `<RUN>/stats.md`: every count and table, under fixed `###` headings.
- `<RUN>/run-notes.json`: this run's facts: each source's outcome (collected,
  incomplete, failed, not identified, not collected, with the reason), the
  pages rendered, taxonomy terms added, and the paths of the ingest reports.
- The ingest reports it names (`added`, `gone`, `superseded`, `unchanged`,
  `changedAtSource` per source).
- `docs/competitors/<slug>/insights.yaml`: one English summary per record, with
  its mentions. You may read `raw/*.yaml` for a record whose summary is
  unclear, and `raw/site.yaml` for the company's own claims.
- `docs/competitors/<slug>/meta.yaml`.
- The templates: `.claude/skills/competitor-intel/profile-template.md` and
  `changelog-template.md`.

Write:
1. `docs/competitors/<slug>/profile.md`, replacing it, following
   `profile-template.md` exactly: its sections, in its order.
2. A new entry at the top of `docs/competitors/<slug>/changelog.md` (create
   the file with its header if absent), following `changelog-template.md`.

Rules:
- Counts about the evidence come from `stats.md`; counts about this run come
  from the ingest reports and `run-notes.json`. Copy them; never recount or
  estimate. A number the company claims (e.g. "200,000 customers") may be quoted
  as its claim, with the claim's ID.
- Every finding in Selling points, Pain points and Missing cites raw IDs:
  review IDs from `stats.md`, and for what the company promises, the `site-…`
  IDs of those claims in `raw/site.yaml`. Mark findings `stats.md` marks
  "(pasted only)".
- Use Acme's glossary words where the taxonomy links a feature to one.
- "What this means for Acme" is interpretation, and says so: openings,
  threats, personas Acme has no actor for. Keep it to what the evidence
  supports.
- English only; no reviewer names; no quotes longer than a few words.

Reply with only: the files written and any number you could not find.
