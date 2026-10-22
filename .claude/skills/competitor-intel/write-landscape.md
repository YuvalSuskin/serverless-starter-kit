# Subagent prompt: write the landscape

Give the subagent this prompt, filled in.

---

You are writing `docs/competitors/landscape.md`: a lookup of Acme's
competitors (what Acme is and whom it serves: `docs/product/shared/market.md`),
feature by feature. Replace the file.

Inputs:
- `<RUN>/stats-all.md`: relevance, the per-feature lookup and persona
  coverage, under fixed `###` headings, each feature a `####` block.
- `docs/competitors/*/insights.yaml`: each competitor's English summaries with
  their mentions (for the good and bad lines), and `docs/competitors/*/raw/site.yaml`
  for what a competitor claims where no review speaks of it.
- `docs/competitors/*/profile.md`: for one line about each competitor.
- The template: `.claude/skills/competitor-intel/landscape-template.md`.

Rules:
- Follow the template exactly. Every table and count comes from
  `stats-all.md`, copied; you only add the "What's good" and "What's bad"
  columns.
- Good and bad lines describe what reviewers (or the site) say about that
  feature at that competitor, specifically and briefly. No verdicts, no
  recommendations, nothing about what Acme should do: the landscape is a
  lookup, and interpretation lives in each profile.
- English only; no reviewer names.

Reply with only: the file written, and any feature block you could not fill.
