# Identifying a competitor's listings

Goal: for each source on the closed list, the one listing that is this
competitor's, or a confirmed "none". Never guess: similar names are common (a
print shop called "Example Co Prints" is not a product called ExampleCo). The market, its
language and its review sites are in `docs/product/shared/market.md`.

**Candidate pages are read by a subagent**, to keep this session light: you
run web searches (their result titles and URLs are fine to read) and `render`
candidate pages; a subagent reads the renders and reports back only what this
file asks for. Glancing at a page yourself to settle a doubt is fine; no
reviewer's name is ever written to a file.

## 1. Candidates

- **The official site:** search the web for the brand, and for its name in the
  market's language when that differs. Note the domain.
- **The review sites in `market.md`:** search each for the brand
  (`site:<address> <brand>`, and the name in the market's language). The tool
  collects nothing from them, so a listing found there is not recorded in
  `meta.yaml`: name it in your report, so the owner can paste its reviews
  (*Pasted material* in `SKILL.md`).
- **Google:** `pnpm -s competitors find google "<brand> <name in the market's
  language>" --gl <country> --hl <language>` (the market's codes, from
  `market.md`; default `us` and `en`) lists candidate places with their
  `data_id`, review count, type and website; it costs one SerpApi search.
  Similar names are common (an "EXAMPLECO" consultancy, an "exampleco store"
  print shop): the website and type settle it.

## 2. Confirm through a subagent

`pnpm -s competitors render <url> --slug <slug>` the site's home page and
each review-site candidate. Then dispatch one subagent with this prompt, filled in:

---

You are confirming which listings belong to a company, for Acme's
competitor research. Read-only.

The company: <brand>, <website>. Rendered pages (each has `.html` and `.txt`):
<list: URL -> path without extension>.

1. For each review-site page: is it this company? Compare the business name, the
   website it links to, and what it sells. Answer yes / no / unsure, with the
   evidence in a few words. Never mention reviews or reviewers.
2. From the home page's `.html` (its navigation links are there, not in the
   `.txt`): list the pages that describe the product for each kind of
   customer the site addresses, and the pricing, features, FAQ and testimonial
   pages. Absolute URLs only, on the company's
   own domain.

Reply with only those two lists. Quote nothing else from the pages.

---

## 3. Gate 1: only when needed

A candidate is **confirmed without asking** when it links to the competitor's
own domain (its website field, or a link on the listing), or the competitor's
own site links to it: that settles identity (owner, 2026-09-29). Say in the
report which listings were confirmed this way, with the evidence.

Ask the owner (**Gate 1**) only about a candidate that is unsure (no link
either way, or a near-miss name) and about a source where nothing was found,
which is recorded as `null` once confirmed. The site pages to render need no
gate: list them in the report.

## 4. meta.yaml

```yaml
name: Example Co
slug: example-co
aliases: [Example Company, Exampleco]   # also its name in the market's language
domains: [example-co.example]
confirmed: 2026-09-29          # the day the owner confirmed Gate 1
listings:
  google: { data_id: "0x...:0x...", place_id: null, url: https://maps.google.com/... }
  site:
    - https://example-co.example/pricing
    - https://example-co.example/features
```

A source left out of `listings` means "not identified yet"; `null` means the
owner confirmed there is none (for example `google: null`). `google` takes
`{ data_id, place_id, url }`; `site` is a list of the competitor's own pages.
