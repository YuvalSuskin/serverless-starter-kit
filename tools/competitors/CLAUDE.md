# tools/competitors

`pnpm competitors`: collect, validate and count the competitor data in
`docs/competitors/`. The owner-facing
entry is the `competitor-intel` skill (`.claude/skills/competitor-intel/`).

Reviews come from two sources only: Google (collected through SerpApi) and
material the owner pastes. A competitor's own site gives claims, not reviews.
The review sites a market has beyond Google are listed in
`docs/product/shared/market.md`; the skill looks for a competitor's listing
there, and the owner pastes what it holds. No adapter scrapes them: add one
only for a site the owner names, with its own recorded-page fixtures.

| Command                                                        | What it does                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm competitors check [slug] [--against <ref>]`              | validate the data; `--against` also proves raw/ only grew since a ref     |
| `pnpm competitors fetch google <slug> [--hl <lang>]`           | collect the listing in `meta.yaml` politely, then ingest it               |
| `pnpm competitors find google "<query>" [--gl <c>] [--hl <l>]` | candidate Google places for identifying a competitor (one SerpApi search) |
| `pnpm competitors render <url> --slug <slug>`                  | save a page, rendered by Chromium, as HTML and text in the cache          |
| `pnpm competitors stats <slug> \| --all [--as-of <date>]`      | every number and table tier 3 shows, under fixed `###` headings           |
| `pnpm competitors ingest <slug> <file.json>`                   | the only way records enter `raw/`: IDs, matching, `gone`/`superseded`     |
| `pnpm competitors pending <slug> [--all] [--out <file>]`       | raw records with no insight yet, for tagging batches                      |
| `pnpm competitors insights <slug> <file> [--retag]`            | the only way entries enter `insights.yaml`                                |

Every command takes `--root <dir>`. `--gl` (country) and `--hl` (language) are the
market's, from `docs/product/shared/market.md`; they default to `us` and `en`.

## Rules

- **Node runs the source directly**: relative imports end in `.ts`, and only
  erasable TypeScript syntax is allowed (`erasableSyntaxOnly`).
- **Only a proven-complete collection marks records `gone`**, and only a
  page listed in `urls` as fully re-extracted supersedes its claims.
- **Text is evidence**: YAML is read and written with `yaml` (never
  `js-yaml`, which folds lines), and a round trip keeps it byte for byte.
- **`--root`** lets tests run against a copy of a fixture
  in `src/fixtures/` laid out like the repo (`src/testing.ts`).
- **Fixtures carry no reviewer identity**: names become `ANON-NAME`, user IDs `0`.
  Prettier skips `src/fixtures/`, so recorded pages stay as recorded.
- **`render` writes to `~/.cache/acme/competitors/<slug>/`**, outside the
  repo; only its paths and sizes are printed. Its tests launch Chromium
  against local files in `src/fixtures/render/`.
- **The SerpApi key** comes from `SERPAPI_API_KEY`, or `.env.local` at this
  checkout or the main checkout (`src/secrets.ts`); it is never printed, and
  errors have it removed. Tests use recorded responses in `src/fixtures/google/`.
