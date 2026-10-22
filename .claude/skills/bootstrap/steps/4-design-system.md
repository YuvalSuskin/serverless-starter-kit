# Step 4: Design system

The brand as data and as guides: the tokens, the font, `DESIGN.md`'s brand
section and the copy guide. Read `design/CLAUDE.md` and `design/DESIGN.md`
first; they say what is generated and what is hand-written.

**Needs:** step 2 done (the actors and what the product promises shape the
feel), and the language from step 1.

**Fills:** no `fills.json` token. It fills the sections marked **Stub** in
`design/DESIGN.md` and `design/copy.md`, and replaces the neutral values in
`design/tokens/tokens.json`.

**Keep the `Skeleton:` marker.** `frontend/src/app/fonts.ts` and
`frontend/e2e/budgets.ts` open with it, and this step edits both. Rewrite the
rest of that first comment line if it no longer reads right (the font's
name), but leave the words `Skeleton:` at its start: step 6's list holds
every marked file until step 6 removes the marker, and
`tools/bootstrap/src/skill.test.ts` fails on a marker that goes early.

## Asks

One question per message, in this order. Show, do not only tell: for colour
and type, offer two or three concrete options (hex values with their contrast
on the page background, a font name with a line set in it), with your
recommendation first.

1. **The feel,** in three words, and what it must never feel like.
2. **References:** products, sites or printed things whose look the owner
   likes, and what about each. Optional; screenshots welcome.
3. **Colour:** an accent (the one colour that means "this is us" and "act
   here") and how much colour the product shows. Offer options that reach 4.5:1
   for text on the page background. Light only: the template has no dark
   theme (`tokens.json` holds one set and nothing in the frontend reads a
   dark one), so do not ask for dark colours. If the owner wants dark, record
   it as a bead for later work, not this step.
4. **Type:** the face, from Google's catalogue as a Fontsource package
   (`@fontsource-variable/<name>` where a variable cut exists). It must cover
   the language's script. Inter covers Latin, Greek and Cyrillic only: Hebrew,
   Arabic, the CJK scripts, Thai, Devanagari and the like **must** take another
   face (for example Rubik or Heebo for Hebrew, Noto Sans Arabic or IBM Plex
   Sans Arabic for Arabic, Noto Sans JP, KR or SC for CJK). A custom font build
   is possible, and the step explains it as an option, never a default.
5. **Shape:** how round (sharp, slightly round, round), and what is round.
6. **Voice:** who is speaking to whom, the form of address in the language
   ("you", formal or not, or none), and three words users should never read.
   The owner's own sentences are the best answer.

## Writes

- **`design/tokens/tokens.json`:** the grey scale, the accent, the roles, the
  status colours, the radii and the type stack, each with its `$comment`
  saying what it holds and what was traded for it, and each colour its
  contrast on the page background (the file's own rule). Keep the names the
  frontend maps unless a name no longer fits; then rename it in
  `frontend/src/app/globals.css` and `src/lib/utils.ts` too.
- **`design/tokens/tokens.css`,** rebuilt, never edited:
  `python3 design/scripts/tokens/build_tokens.py`. Run it twice; the second
  run leaves `git status` as the first did.
- **The mapping in `frontend/src/app/globals.css`:** the `@theme inline`
  block maps every token onto Tailwind's names and shadcn's semantic colour
  names (`--color-primary`, `--color-ring` and the rest). Update it for every
  token added, renamed or removed; `tests/theme-parity.test.ts` fails on a
  text size or radius missing from `src/lib/utils.ts`.
- **The radii the components take,** from question 5: `tokens.json`'s
  `radius` comment says which kind of thing takes which radius, and the
  components follow it. Today a field takes `rounded-input` and
  `frontend/src/ui/button.tsx` and `tabs.tsx` take `rounded-pill` (their
  header comments say so). If the owner puts buttons with the fields (say
  "buttons and fields round"), change Button's class to `rounded-input`, its
  header comment and the token comment, so all three say the same.
- **The font:** `pnpm -C frontend add @fontsource-variable/<name>@<exact
  version>` (a version past pnpm's one-day `minimumReleaseAge`), remove the
  old package, import the new one in `frontend/src/app/fonts.ts` (its
  `Skeleton:` marker stays, above), and put the family name the package
  declares in `tokens.json`'s `type.ui.stack`. Never `next/font/google`
  (`frontend/tests/bundled-fonts.test.ts`).
- **The budgets, re-measured** after a font change: a font's files differ in
  size, so `frontend/e2e/budgets.ts`'s font numbers move. Print what each page
  loads with `BUDGETS_PRINT=1 pnpm -C frontend exec playwright test
  e2e/budgets.spec.ts --project=chromium` after `pnpm -C frontend build` (the
  spec prints one `budgets:` line per page; it prints nothing without the
  variable), and set the tiers about 10% above (`frontend/CLAUDE.md`,
  _Performance budgets_), saying why in the commit. Then `pnpm e2e` passes on
  the new numbers.
- **`design/DESIGN.md`:** _The brand in brief_ (voice, colour, type, shape,
  state) and _The surfaces_ (from the actors' places in step 2's specs), each
  pointing at where the values live. _Screens that got it right_ stays a stub
  until the owner names one, so the skeleton note at the top stays too,
  reworded to say that section is the one stub left; it goes when that
  section is filled.
- **`design/copy.md`:** sections 1 to 5 from question 6 and the glossary
  (`docs/product/shared/glossary.md`): the voice, the form of address, the
  language's own habits (the rules a native writer keeps that a translation
  breaks), the phrasebook, and one rule per kind of text. Section 3 is the
  language's wording rule; for English it holds the variety's habits the
  market needs (UK or US spelling, how dates and times are written), or says
  "none beyond the guide" when the market has none.

## Records

- BS rows: the feel and the references; the accent and how much colour; the
  font and why (its script coverage); the radii; the form of address. Each
  draft the owner did not word themselves (the palette, the voice
  paragraphs) is a `batch-<n>` item for the next review batch.

## Done when

- `tokens.json` holds the project's values, `tokens.css` is rebuilt and a
  second build leaves the worktree as it was.
- The font covers the language's script, is bundled by Fontsource, and the
  budgets pass on the new numbers.
- `design/DESIGN.md` and `design/copy.md` have no **Stub** except _Screens
  that got it right_, and `DESIGN.md`'s note names that one.
- `git grep -l -F 'Skeleton:'` lists the same files as before the step
  (`pnpm -C tools/bootstrap test` checks it).
- `pnpm -C frontend check` passes (the theme parity and bundled-font tests
  among it).
