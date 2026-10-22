# Designing for Acme

> **Skeleton.** The process sections (flow, composing, checks) are the
> template's generic rules and stay. Sections marked **Stub** are empty on
> purpose: the bootstrap (step 4) fills them from the owner's answers, and the
> project owns them from then on. Delete this note when the last stub is
> filled.

Where to start when you design a screen. It tells you what to do first and
where each kind of knowledge lives.

## When to read this

- Before you design or change a screen.
- Before you write any text a user will read. That includes screen-reader
  labels, page titles and descriptions, and emails.

## Start from the flow

Real user flows lead to good design. A screen is one step in someone's
journey, not a container for parts. A screen designed as a container comes
out as a template.

**Read the feature's product spec first** ([docs/product/](../docs/product/)).
If no spec covers the screen, stop: write or revise the spec with the
`product-spec` skill. Design never invents behaviour. Work no user would
notice needs no spec, and has no screen to design.

**Then write the brief,** five lines, before any layout:

1. **The person and where they are**, from the spec's situations.
2. **The journey step** this screen is, from the spec's journeys.
3. **The main action:** the one thing they came here to do.
4. **The worries** this screen must answer, in the person's words.
5. **The states** it must show: empty, loading, ideal, error.

Put the brief in the feature's technical design, or in the PR when the change
has none. A change to text alone still gets lines 1 and 4: who reads this,
and what do they want to know?

## Composing a screen

These are leanings, each with its reason. They are not a recipe: a recipe
followed everywhere becomes the next template. When a leaning does not fit
your screen, keep its reason and find another way to serve it.

- **Order the screen by what the person needs first,** whatever the data
  model or the affordance table lists first.
- **One main action,** with the place and the weight that make it the obvious
  thing to do. Two actions of equal weight ask the person to choose before
  they can act.
- **For everything else, ask three questions, in this order.** Can it go? Can
  it come later? Can it be quieter? What leads stays generous: a screen
  stripped until it looks unfinished fails as surely as a crowded one.
- **Quiet is for what is secondary.** The three questions apply to everything
  except what leads, which stays generous in size, room and colour.
- **The amount chooses the form.** Ask how many items a person usually sees,
  and how many at most. Five or six items do not need a table; thousands need
  a form built for scanning. The amounts are product facts: take them from
  the spec's limits.
- **Make one thing lead, by a wide margin.** Hierarchy comes from how far
  apart the choices sit, not from new values: jump two or more steps on the
  type scale, and give the leading element the most room.
- **Space is weight.** The thing with the most room around it leads; equal
  gaps everywhere make everything equal.
- **Show the next step; do not describe it,** and answer a worry beside the
  action it holds back, not at the bottom of the page.
- **A part belongs to its page.** It takes its alignment and rhythm from its
  neighbours; a part aligned differently looks brought in from another site.
- **A computer screen holds the page.** On a computer, a signed-in app page
  or a sign-in page fits a 14-inch laptop with the browser in full screen
  (1512 by 860 pixels) without scrolling. A long list or table may scroll,
  inside its own region, under a header and actions that stay put; a form
  never scrolls. A form that does not fit loses fields, or is split into
  steps, which is a change to its product spec. Public pages built for a
  phone are exempt. `frontend/e2e/laptop.ts` checks it (DG52).

**Templates, and what to ask instead.** None of these is forbidden; each
deserves a question first.

| The pattern | Ask instead |
|---|---|
| A centred heading, a line under it, three cards in a row | Are these three things equal, and does the person need all three at once? If they are steps, can the screen show the sequence? |
| A card around every piece of content | What does this border separate from what? Would space alone group it? |
| An icon in a circle beside each feature | Would the real screen, or a real photo, show this better than a symbol? |
| A coloured pill for every state | What does the person want to know: what to do next, whether it is working? Can words, progress or layout say it? |
| A screen that shows everything it has | What would the person not miss? Can it wait for the next step? |

## Check before shipping

Look at the real screen, not the code. Start a preview with the `preview`
skill (`tools/preview/CLAUDE.md`) and open the screen at a phone's size
first.

1. **First glance.** Look away, then look back. What do you see first? It
   should be what the brief's third line names.
2. **The main action.** Is there one? Can a thumb reach it on the phone?
3. **The worries.** For each worry in the brief, point to where the screen
   answers it.
4. **The states.** Have you seen each state in the brief, not only the ideal
   one?
5. **The boxes.** For each border or card, say what it separates.
6. **The laptop.** On an app or sign-in page, open it at 1512 by 860. Does it
   fit without the page scrolling, with only a list or table scrolling inside
   its region?
7. **The whole page.** Does the part share its neighbours' alignment and
   width? Does it look finished?
8. **The templates.** Hold the screen against the table above.
9. **Reduced motion, and the writing direction.** The rules are in
   [frontend/CLAUDE.md](../frontend/CLAUDE.md).
10. **The text.** Run [copy.md](copy.md)'s own check.

If the first glance lands on the wrong thing, return to the brief, not to the
spacing.

## The brand in brief

**Stub.** One paragraph each, naming where the full answer lives (values are
in `tokens/tokens.json`, never repeated here).

**Voice.** *Stub: who is speaking, in two or three plain sentences, and the
one thing the voice never does.*

**Colour.** *Stub: when colour appears and when it does not, what the accent
means, and which colour is the text and the main button. Values and contrast
are in [tokens/tokens.json](tokens/tokens.json).*

**Type.** *Stub: the face, what each size is for, and the smallest size. Steps
and limits are in [tokens/tokens.json](tokens/tokens.json); classes are in
[frontend/CLAUDE.md](../frontend/CLAUDE.md), "Tokens only".*

**Shape.** *Stub: how round, and what is round. Values are in
[tokens/tokens.json](tokens/tokens.json).*

**State.** *Stub: how the product shows that something worked, failed or is
waiting.*

## The surfaces

**Stub.** *A table of the project's surfaces (a public site, a signed-in app,
a phone-first page): who is there, on what device, and how loud the brand is
on each. Actors are defined in `docs/product/shared/actors.md`.*

## Which source wins

When two sources disagree, the higher one wins:

1. the feature's product spec, for what the screen does;
2. `design/tokens/tokens.json`, for every value;
3. this guide and [copy.md](copy.md);
4. any mockup, which decides layout only where the rest is silent.

If a guide and a product spec disagree, the spec stands until it is revised.

| Knowledge | Owner |
|---|---|
| Values: colours, sizes, radii, motion | `design/tokens/tokens.json` |
| What a feature does | `docs/product/<feature>.md` |
| Concept names | `docs/product/shared/glossary.md` |
| Classes, lint rules, libraries | `frontend/CLAUDE.md` |
| Composing a screen | this file |
| Wording | `design/copy.md` |

## Screens that got it right

**Stub.** *Once the owner names screens as good design, list them here with the
code that builds them and a reading of why they work. Until then, none.*

## Aligning to a mockup or an inspiration

When the owner says a screen should look like a mockup, a screenshot or
another product, matching its look is part of the work, not a later polish.
Reading the mockup's text or its flow is not enough. So:

1. **Render it.** Open the mockup in a browser at a phone size (serve a
   local file over `http://127.0.0.1`) and screenshot each screen the work
   touches. Do the same for the built screen, in Storybook or a preview.
2. **Compare side by side and write the gaps down,** screen by screen:
   layout, hierarchy, what leads, sizes and proportions, colour and
   darkness, imagery, the main control's shape and place, spacing, and
   where each piece of text sits.
3. **Build to the mockup,** then compare again, until the only differences
   left are the ones this page's source order requires: tokens for every
   value, the product spec for behaviour, `copy.md` for wording. Name each
   kept difference and why.
4. **Show it.** The PR describes each screen before and after, and says
   which differences were kept on purpose.

Screenshots go only to a session scratchpad. A private mockup (one kept
outside the repo) is never copied, committed or quoted wholesale. A plan names
the mockup screens each UI task matches
(`docs/superpowers/plans/CLAUDE.md`).

## The guides

- **[copy.md](copy.md):** open it when you write or change any text.

**The design researcher.** For research or a second opinion, dispatch the
`design-researcher` agent (`.claude/agents/design-researcher.md`). It has
two jobs: to review a spec's flow before the owner reads it, and to research
how a screen could be laid out, with references from real products. It
reports and changes no file: it has no editing tools, though it keeps the
shell, so that promise rests on its instructions and not on a lock. Its
references are inspiration, and these guides outrank them.
