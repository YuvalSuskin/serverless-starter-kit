# design/

The design's source of truth. Nothing here is frontend code: no components, no
framework, no build step that an app depends on. This is what you consult
*when designing*, and what a designer or a new developer should be able to
open without running anything. To design a screen or write its text, start at
`DESIGN.md`.

It is self-contained, scripts included, so the project root stays clear for
the app. `scripts/` is the only part you need Python for, and only to
regenerate (Python 3, nothing to install).

**The template ships a neutral set:** a grey scale, one accent and one bundled
font. `tokens/tokens.json`, `DESIGN.md` and `copy.md` are stubs the bootstrap
(step 4) fills with the project's own; their structure stays.

## What is in here

| Path | What it is | Edited by hand? |
|---|---|---|
| `DESIGN.md` | Where to start when designing a screen or writing text a user will read: the brief, how to compose a screen, the brand in brief, which source wins. | **Yes** |
| `copy.md` | How to write for this product, and the phrasebook. The owner settles every wording in it. | **Yes** |
| `tokens/tokens.json` | The design's values as data: colour, the type scale, radii, motion. Each value carries a `$comment` saying what it holds. | **Yes** |
| `tokens/tokens.css` | The same values as CSS custom properties. | **No: generated** |
| `scripts/tokens/build_tokens.py` | The generator for the row above. | **Yes** |

There is no font and no logo here. The font is an npm package
(`@fontsource-variable/inter`, installed by `frontend/`) and is bundled by the
frontend's build, so nothing fetches a font at run time. A logo and the app
icons arrive with the project's brand, in bootstrap step 5.

## The rule that matters

**Do not hand-edit anything marked generated.** Those files are rebuilt from
`scripts/`, and an edit made here is silently destroyed on the next build.

```bash
python3 design/scripts/tokens/build_tokens.py   # tokens.json -> tokens/tokens.css
```

The build is deterministic: run it twice and `git status` shows the same as
after the first run. If a rebuild leaves the worktree dirty, something
genuinely changed; do not wave it through.

To change a *value*, edit `tokens/tokens.json` and rebuild. Keep the comment
pattern: a value, or the group it belongs to, says in a `$comment` what it
holds and what was traded for it. A new colour records its contrast on the
page background. To change the font, see `frontend/src/app/fonts.ts`.

## Who consumes this

`design/` is the design's home, not a UI package. Exactly one slice of it is
read by code elsewhere in the repo, and `design/package.json` names that slice
as `@acme/design`:

| Export | File | Read by |
|---|---|---|
| `@acme/design/tokens.css` | `tokens/tokens.css` | `frontend/src/app/globals.css`, mapped into Tailwind |

The `exports` map **is** the contract. Moving or renaming that file, or
changing a token's name, breaks the frontend, and the frontend's checks run on
every change under `tokens/` to catch it (the workspace graph). Nothing else in `design/` is a dependency
of anything. The package has no scripts and no build: the Python generator
does not see it.
