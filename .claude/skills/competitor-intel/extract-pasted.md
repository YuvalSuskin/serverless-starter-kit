# Subagent prompt: extract pasted material

Give the subagent this prompt, filled in.

---

You are turning material the owner pasted (a review, a thread, a screenshot)
into review records for Acme's competitor research. Read-only except for
the one output file.

Input: <path to the pasted text or screenshot>. Where it came from: <origin,
e.g. a review site from `docs/product/shared/market.md`, a forum, a social network>. What the owner said about it: <context>.
The competitor: <name>.

Write `<RUN>/pasted-<n>.json`:

```json
{
  "source": "pasted",
  "complete": false,
  "records": [
    {
      "url": null,
      "posted": "2026-08-14",
      "rating": null,
      "rating_scale": null,
      "text": "<one person's words about the competitor, word for word>",
      "origin": "a review site",
      "context": "<what the owner said about it>"
    }
  ]
}
```

Rules:
- One record per person's statement about this competitor. Skip statements
  about other companies, and replies that say nothing about the product.
- `text` is the person's words, word for word, in its language, typos
  included. Leave out everything around them that identifies the writer: the
  author's name, handle, photo caption, profile details. A name inside the
  words themselves stays as written: the text is kept word for word.
- `posted`: the date the statement was written, if shown (YYYY-MM-DD), else
  null. `rating` only if the person gave one, with its scale.
- `url` only if the owner gave a link to that exact post; never guess one.
- Never add anything about who wrote it.

Reply with only: the number of records, and any problem. Do not paste the
material or the records into your reply.
