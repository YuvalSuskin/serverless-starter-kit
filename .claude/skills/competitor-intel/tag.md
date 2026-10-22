# Subagent prompt: tag one batch

Give the subagent this prompt, filled in.

---

You are tagging reviews and site claims about a competitor of Acme against a
shared taxonomy. Acme's market is described in `docs/product/shared/market.md`.
Read-only except for your two output files.

Input: `<RUN>/batch-<n>.json`, a list of `{ ref, source, text, kind? }`
(`kind` is set for site claims). The taxonomy:
`docs/competitors/taxonomy/features.yaml` and `personas.yaml` (read both in
full, including each term's `aliases`; ignore terms whose `withdrawn` is not
null). The product's own words: `docs/product/shared/glossary.md` and
`actors.md`. Today: <YYYY-MM-DD>.

Write `<RUN>/insights-<n>.json`, one entry per record in the batch:

```json
[
  {
    "ref": "google-694cfcb1eeee0d9b184fad86",
    "persona": "freelancer",
    "summary_en": "Client made them switch tools; support replies came late and the plan cost more than rivals.",
    "mentions": [
      { "feature": "support-replies", "sentiment": "negative", "kind": "pain" },
      { "feature": "price", "sentiment": "negative", "kind": "pain" }
    ],
    "tagged": "<YYYY-MM-DD>"
  }
]
```

- `persona`: who wrote it or whom the claim addresses (a persona ID), or null
  when unclear. Someone who buys or hosts on behalf of a persona is tagged with
  the persona they act for.
- `summary_en`: one English sentence of what the record says, specific (what
  worked or failed, and how), no names of people.
- `mentions`: one per feature or aspect the record talks about, using only IDs
  in the taxonomy:
  - `sentiment`: positive, negative, mixed or neutral, about that feature.
  - `kind`: `praise` (done well), `pain` (done badly), `missing` (wanted and
    not offered; the feature may be one this competitor lacks), or `claim`
    (site claims only, with sentiment `neutral`).
  - A review praising the service and complaining about the price has two
    mentions. A record with nothing taggable has `"mentions": []`.
- Tag what the text says, not what you infer about the product.

Write `<RUN>/proposals-<n>.json` (an empty list `[]` if you have none). Three
kinds of proposal:

```json
[
  {
    "proposal": "feature",
    "id": "multi-language-export",
    "name": "Multi-language export",
    "type": "feature",
    "stage": "sharing",
    "glossary": null,
    "aliases": ["export in English", "translated export"],
    "why": "Several users with clients abroad ask for exports in English.",
    "mentions": [{ "ref": "google-...", "sentiment": "negative", "kind": "missing" }]
  },
  {
    "proposal": "persona",
    "id": "office-admin",
    "name": "Office admin",
    "actor": null,
    "aliases": ["administrator", "office manager"],
    "why": "Reviews written by office administrators about the billing screen.",
    "refs": ["google-..."]
  },
  { "proposal": "alias", "alias_for": "support-replies", "aliases": ["helpdesk answers"], "why": "Common word for the support desk." }
]
```

- A **feature** or aspect proposal is for a concept no term covers. `type` is
  feature or aspect; `stage` is a step of the product's own lifecycle in
  kebab-case (reuse a stage already in `features.yaml` where one fits, and
  name a new one in `why`), or `aspect` for aspects. `glossary` is the ID of a glossary
  term that means exactly the same thing, else null. Its `mentions` are the
  ones you would have added; they are **not** in the insights file.
- A **persona** proposal is for a kind of customer no persona covers. `actor`
  is the ID of the actor of Acme that is exactly that, else null. `refs` are the
  records whose `persona` it would be; in the insights file they have
  `"persona": null`.
- An **alias** proposal is for a new word for an existing term: tag those
  records with the existing ID as usual, and propose the words.
- Never put a proposed ID in the insights file.

Reply with only: the number of entries written, mentions per kind, and the
proposed IDs. Do not paste review text into your reply.
