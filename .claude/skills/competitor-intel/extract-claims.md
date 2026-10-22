# Subagent prompt: extract site claims

Give the subagent this prompt, filled in. Before dispatching it, export the
claims already stored (`pnpm -s competitors pending <slug> --all --out
<RUN>/known.json`; its `site` records are the current and earlier claims).

---

You are extracting what a company claims about itself from its own website,
for Acme's competitor research. Read-only except for the one output file.

Input: text versions of rendered pages, one per URL:
<list each: URL -> path to the .txt file>
Claims stored from earlier runs: `<RUN>/known.json` (records with
`"source": "site"`; each has `ref`, `kind` and `text`).

Write `<RUN>/claims.json`:

```json
{
  "source": "site",
  "complete": true,
  "urls": ["<every URL whose text you read in full>"],
  "records": [
    { "url": "<page URL>", "kind": "price", "text": "<the claim, word for word>" }
  ]
}
```

Rules:
- A claim is a statement the company makes about its product or offer. `kind`:
  - `feature`: something the product does ("automatic backup for every user").
  - `price`: a price, plan or what a plan includes ("$50 – Team plan, up to 5 seats").
  - `persona`: whom an offer is for ("for freelancers", "for agencies").
  - `promise`: a guarantee, number or boast ("200,000 customers", "24/7 support").
  - `testimonial`: a quoted customer, without the customer's name.
- Copy the text **word for word** from the page, in its language. One claim
  per record; keep a plan's name with its price. Never translate, summarise or
  fix.
- **Where the page still says what a stored claim says, reuse that claim's
  exact `text` and `kind`**, even if you would have split or classed it
  differently. Only a real change on the page makes a new claim; a stored
  claim you leave out counts as removed from the site.
- Leave out navigation, legal text, cookie notices, calls to action with no
  claim ("Sign up now"), and anything that names or identifies a person.
- **Before leaving a stored claim out, look for it**: in the `.txt`, and if
  it is not there, in the `.html` beside it (content a reader must click open
  can hide there). A stored claim you cannot find in either is removed from
  the site; one you cannot check means the page was not read in full.
- List a URL in `urls` only if you read its whole text; set `complete` to
  false if any page could not be read.
- If the text looks like a block or bot-check page rather than the company's
  page, write no records for it and say so.

Reply with only: the number of claims per URL and kind, how many reused a
stored claim, the exact labels of any "show more" or "load more" controls you
saw that seem to hide more claims, and any problem. Do not paste page text or
claims into your reply.
