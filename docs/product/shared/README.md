# docs/product/shared/

Rules and vocabulary that more than one product spec shares: language and
direction, privacy and consent, the glossary, the actors.

Three files start as stubs, marked as such; the bootstrap and the first specs
fill them:

| File | Holds | Filled by |
| ---- | ----- | --------- |
| `market.md` | The market, its language and direction, and the review sites its users write on | The bootstrap's product-brief step (`/bootstrap`, step 2) |
| `actors.md` | Who uses the product and where, one ID each | The first spec that needs an actor |
| `glossary.md` | The product's words, one ID each | The first spec that introduces a term |

A rule more than one spec follows (language and direction, privacy and
consent) gets its own file here, with a stable ID that other docs cite, the
first time a second spec needs it. Promises to users live only in such a
file, and only the owner's words go in it.
