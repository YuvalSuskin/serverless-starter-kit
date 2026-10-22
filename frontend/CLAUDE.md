# frontend/

The Next.js app. One app serves several **pillars**, each a route group
`src/app/(<pillar>)/`. The skeleton has two: `(marketing)`, the public pages,
and `(app)`, a signed-out app page; bootstrap step 6 replaces them. It is
English and left to right. The decisions behind it are in
`docs/decisions/2026-09-24-frontend-open-decisions.md`.

## The loop

```bash
pnpm fix      # eslint --fix, then prettier --write
pnpm check    # format, lint, types, knip, all tests -- exactly what CI runs
```

Run `fix`, then `check`. Whatever `check` still reports needs a human
decision: a type error, a boundary violation, an a11y failure, or an
unhandled promise. **Never claim a task is done while `check` is red.** CI
only checks; it never fixes.

| Command                                                                | What                                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                             | From the root: Next and the backend API together, Next proxying `/api/*`. From `frontend/`: Next only                           |
| `pnpm storybook`                                                       | Storybook on :6006                                                                                                              |
| `pnpm test`                                                            | Every Vitest project (unit, browser, stories)                                                                                   |
| `pnpm e2e`                                                             | From the root: a production build, then the Playwright tests on desktop, iPhone and Android (`--project=android` for one)       |
| `E2E_BASE_URL=<url> pnpm --filter @acme/frontend exec playwright test` | The e2e specs against a running `pnpm preview` (no build, no server of their own). `E2E_PORT` moves the default server off 3100 |
| `pnpm typegen`                                                         | Generates `next-env.d.ts` (route and CSS-module types). `fix`, `check` and `typecheck` run it for you                           |

All of these work from the repo root and from `frontend/`. Turborepo runs
them: from `frontend/` only this package's tasks, from the root every
package's. The exception is `pnpm dev`: from `frontend/` it starts Next alone,
and `/api/*` calls fail until the API runs too (`pnpm dev` in `backend/`).
Next listens on `127.0.0.1` only: it proxies `/api/*` to an API whose fakes
trust any claim. To try a phone on your network, run
`pnpm exec next dev --hostname 0.0.0.0`, knowing that anyone on that network
can then act as any seeded user. A task whose inputs have not changed is replayed from its cache.

## Where does this go?

| You are adding                                                   | It goes in                                                                                                                                                                                                                                                                              | It may import                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| A generic, reusable UI piece (button, dialog, a primitive)       | `src/ui/`, flat, with a story next to it                                                                                                                                                                                                                                                | `ui`, `lib` (not `lib/data`)                                      |
| Domain UI or logic used by more than one pillar (a form, a list) | `src/features/<name>/`, exposed through `index.ts`                                                                                                                                                                                                                                      | `ui`, `lib`, other features via their `index.ts`                  |
| UI used by one pillar only                                       | `src/app/(<pillar>)/…/_components/`                                                                                                                                                                                                                                                     | `features`, `ui`, `lib`                                           |
| A hook that reads or writes server state                         | `src/lib/data/`: one hook per domain operation, returning `QueryResult` / `MutationResult` from `types.ts`, never SWR objects. The only place `swr` may be imported.                                                                                                                    | `lib`                                                             |
| Pure logic with no React                                         | `src/lib/`                                                                                                                                                                                                                                                                              | `lib` only (not `lib/data`)                                       |
| A call to the backend API                                        | `src/lib/data/`: a hook (client) or function (server) that calls `publicCall("<name>", input, options)` (`public-call.ts`; one file per audience, each importing its audience's routes only, so a page ships no other audience's routes). Nothing outside `src/lib/data/` imports them. | `lib`, `@acme/contracts` (types only), `@acme/contracts/client/*` |

`eslint-plugin-boundaries` enforces the right-hand column. A pillar never
imports another pillar's code.

## Tests

| File                | Runs in                              | Required for                                                                          |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| `*.test.ts`         | Node                                 | logic in `lib/` and `features/`                                                       |
| `*.test.tsx`        | real Chromium                        | hooks, anything needing a DOM                                                         |
| `*.mobile.test.tsx` | Chromium as a Pixel 7 (412px, touch) | tests that only make sense on a phone: touch handlers, phone layout                   |
| `*.stories.tsx`     | real Chromium                        | **every** `src/ui/` component (enforced); any feature component that should be tested |

- **An app page joins `e2e/laptop.spec.ts`** when it is built: it must fit the
  owner's laptop without the page scrolling (`design/DESIGN.md`, "A computer
  screen holds the page").
  Use `expectFitsLaptop` from `e2e/laptop.ts` in a journey that reaches a state
  the list does not cover. A page joins `e2e/mobile.spec.ts`'s list too (no
  sideways scroll, laid out at the device's width).
- **An e2e spec imports `test` and `expect` from `e2e/test.ts`**, not from
  `@playwright/test`. With `ACME_OFFLINE=1` (the `offline` step of
  `pnpm check:full`) that `test` aborts every request off localhost and fails
  the test whose page made one (root `CLAUDE.md`, _Local first_).
- There is no jsdom. It fakes layout, and layout is a thing under test.
- **Mock the backend with `mockRoute(contract)(resolve)`** from
  `src/lib/data/mock-route.ts`, served by MSW (`setupWorker` in a browser
  test). It parses every mock response against the contract, so a mock that
  drifts from the API fails the test using it; the resolver also gets the
  `request`, to assert on headers. See `src/lib/data/messages.test.tsx`.
- **`public/mockServiceWorker.js` is committed**, and msw's install script
  never runs. After an msw upgrade, `tests/msw-worker.test.ts` fails until you
  refresh it with `pnpm exec msw init public`.
- Stories render in the app's language and direction (`@/lib/locale`), with
  the bundled font, and **an axe violation fails the story**.
- A story with a `play` function is an interaction test. Opt a story into the
  other direction with `parameters: { direction: "rtl" }`.
- **Stories run with motion settled** (`.storybook/preview.tsx`): Motion's
  reduced-motion read, `MotionConfig` and CSS transitions and animations are
  all off, so the a11y check after `play()` never reads a half-faded element
  (a colour-contrast failure that shows only on a slow runner). A story that
  tests motion itself (an enter or exit, a reduced-motion story, a `Rule3*`
  story) opts back in with `parameters: { motion: "real" }`, which also forces
  the host's reduced-motion setting off (the stub for Motion; for CSS, every
  test page's browser context reports no preference, `vitest.config.ts`), so
  such a story behaves the same on a runner that reports reduced motion.
- `src/app/` has no tests: route files stay thin.
- `tests/` holds tests of the repo's own rules. `lint-rules.test.ts` pins the
  lint rules below; if you change `eslint.config.mjs` and it fails, you
  weakened a guarantee.
- **Each browser project bundles every package its tests import before its
  browsers start** (`vitest.config.ts`: the scan runs from the project's own
  globs on every start, and the two story projects keep separate bundles). A
  package Vite finds only once tests run reloads every test page, and the run
  then fails at random (`Failed to fetch dynamically imported module`, two
  copies of React) or hangs at 0% CPU: `tests/deps-reload-tripwire.ts` stops
  such a run at once and names the package. Add it to that project's
  `optimizeDeps.include`. "Failed to connect to the browser session" appears
  when the machine is saturated while the browser projects start: that is why
  `pnpm check:full` runs the unit tests one package at a time
  (tools/local-check/src/plan.ts).

## Phones and touch

People use phones, so phones are a test target. The phone
presets live in `e2e/phones.ts`; Vitest's `browser-mobile` project emulates
the Android one in Chromium.

- **Tag a story `mobile`** (`tags: ["mobile"]` on the story or its meta) and
  it also runs in `storybook-mobile`: on the phone, at its size, with the same
  axe check. It still runs on desktop too, so its `play` must pass on both;
  put phone-only assertions in a `*.mobile.test.tsx` file or in e2e. In
  Storybook's UI, pick the "Pixel 7" viewport to see it.
- **Gestures come from `@/lib/gestures`:** `tap(el)`, `longPress(el, {
duration })` and `swipe(el, { direction, distance, duration })`. They send
  a finger's events (touch pointers, then touch events) to the element. Call
  them directly in a test or a story's `play`. Directions are physical: in
  RTL the next item of a horizontal list is to the left, so revealing it is a
  swipe `"right"`. Product code may not import them (lint).
- **Like Playwright's tap, each scrolls the target into view** and rejects a
  target a finger could not touch at its centre: hidden, or covered by
  another element.
- **They are synthetic, so the browser ignores them.** Handlers (and
  Motion's gestures) see them; native scrolling, the long-press menu and text
  selection do not happen, and `setPointerCapture` with their pointer id
  throws.
- **Test scroll-snap by scrolling, not swiping:** `el.scrollBy(...)`, wait for
  `scrollend`, then assert which item snapped. In RTL, `scrollLeft` is
  negative.
- **E2e runs every test on three projects:** `chromium` (desktop), `iphone`
  (iPhone 15, WebKit) and `android` (Pixel 7, Chromium). Use
  `test.skip(!isMobile, ...)` or `hasTouch` for a phone-only check. Prefer
  Playwright's own `locator.tap()` in e2e: it is trusted input. Pass a helper
  to `locator.evaluate(swipe, { direction: "left" } as const)`; without
  `as const` the direction widens to `string`.
- **WebKit locally needs macOS 15+ or Linux**
  (`pnpm exec playwright install webkit`). On macOS 14 Playwright's WebKit
  build is broken, so `iphone` is skipped with a notice, and the PR's `proof`
  job refuses that proof for a frontend change (CI17): GitHub runs no e2e, so
  run `pnpm check:full` on macOS 15+.
- **Every press is at least 44px a side on a phone**.
  `Button` gets it from `pointer-coarse:min-h-11`, so a mouse keeps the
  compact sizes; a hand-made button or link takes `min-h-11` or `size-11`
  itself. `tests/tap-targets.ts` measures what is laid out:
  `e2e/skeleton.spec.ts` walks the pages with it, and a `mobile` story calls
  `phoneSmallTapTargets()` in its `play`. Small on purpose, and named with its
  reason where it is exempted.
- **Keep each helper self-contained.** Playwright sends a helper's source into
  the page (`locator.evaluate(swipe, options)`), so one that calls a
  module-level function breaks there.

## Performance budgets

Public pages must stay fast on a phone with a weak signal; the app's own pages
matter less. `e2e/budgets.ts` maps each budgeted path to a tier (marketing,
app), and `e2e/budgets.spec.ts` checks it in `pnpm e2e` (Chromium projects):

- CSS and fonts fetched up to the load event and JavaScript until the page
  has settled (compressed KB), the request count, and images (KB);
- preloaded fonts, no layout shift (CLS at most 0.01), no render-blocking
  script, and the largest paint never a lazy image.

**A new page joins by adding its path to `PAGES`.** Budgets sit about 10%
above what the pages load today: raise one only on purpose, in a reviewed
change that says why, never to make a failing change pass. To read what
each page loads today, build, then run `BUDGETS_PRINT=1 pnpm exec playwright
test e2e/budgets.spec.ts --project=chromium`: one `budgets:` line per page.
Lighthouse scores compared against `main` come later, as `pnpm perf`.

## Rules, and why

- **Behaviour comes from `docs/product/`.** A feature's product spec holds
  its flows, states, rules and limits. Cite their IDs (`FIND-R8`) in tests
  and PRs; do not invent behaviour a spec does not state. If the spec is
  wrong or incomplete, change the spec first.
- **Design and text start at `design/DESIGN.md`.** Read it before you design
  or change a screen, and before you write any text a user will read,
  screen-reader labels included. It is a guide to read; the rule below on
  `@acme/design`'s exports governs what code may import.
- **Use logical classes**, so a right-to-left language needs no rewrite. Use
  `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`/`border-s`/`rounded-s`,
  never `ml-`/`left-`/`text-left`/`border-l`/`rounded-tl`. Only the inline axis
  flips, so `h-`, `w-`, `mt-` and `top-` are fine. `pnpm fix` rewrites most
  offenders for you.
- **Wrap directional icons in `DirectionalIcon`.** Arrows and chevrons point
  the wrong way in a right-to-left language otherwise.
- **Language and direction come from `@/lib/locale`** (D6), the only place
  they are written: the root layout's `<html lang dir>`, the Storybook preview
  and every formatter read `LOCALE` and `DIRECTION` from it. Lint rejects a
  hard-coded `lang` or `dir` in JSX, and `Intl` and `toLocale*String` calls
  with no locale or one typed in. Format dates, times, numbers and plurals
  only with `Intl`, always passing `LOCALE`; write whole sentences, never text
  built from pieces.
- **A page's title** is the root template's `%s · Acme` (`src/app/layout.tsx`):
  a page sets `metadata.title`. The tab icons are `src/app/icon.*` and
  `apple-icon.*`, which bootstrap step 5 adds with the theme.
- **Tokens only.** Colours, the √2 type scale (`text-100`…`text-500`) and the
  radii (`rounded-card|input|photo|pill`) come from `design/tokens/`.
  Tailwind's defaults (`text-sm`, `rounded-md`) do not exist, and arbitrary
  values (`text-[13px]`) are a lint error. To add a value, change
  `design/tokens/tokens.json`, rebuild tokens, and map it in
  `src/app/globals.css`. If it is a text size or a radius, also add it to the
  lists in `src/lib/utils.ts` (`tests/theme-parity.test.ts` fails until you do).
- **The two steps below 16px are for small UI text only (D2).** `text-075`
  (13.5px) is for captions, helper text and metadata. `text-050` (11.3px) is
  for counts, badges and timestamps, never running sentences. Neither goes on
  a form input: inputs stay at `text-100` or larger, or iOS Safari zooms the
  page on focus.
- **Libraries (D1).** Lucide for icons, plus `@lucide-animated` copied in one
  icon at a time; Motion is the only animation library; SWR only inside
  `src/lib/data/`; URL state through a library, not hand-parsed (add one, with its first use, when a page needs it). Every library must work with the App
  Router, and `next build` / `next dev` must pass under Turbopack. Install a
  library with its first real use: an unused dependency fails knip.
- **Matching a mockup means rendering it and comparing screen by screen.**
  When the owner asks for a screen to look like a mockup or an inspiration,
  follow `design/DESIGN.md`, "Aligning to a mockup or an inspiration":
  screenshot both, list the gaps, build until only the kept differences
  remain, and show before and after in the PR.
- **Code copied from a shadcn registry is our code.** It lands in `src/ui/`,
  gets a story, and is adapted to the tokens. The stock versions use
  `rounded-md`/`text-sm`.
- **Use the shadcn MCP for frontend work** (owner, 2026-10-21; root
  `.mcp.json`, `shadcn@4.21.5`). Search and view registry items and their
  examples through it, and run its audit checklist on a component you
  added; how to bring an item in is the rule below. It is also where to look for
  inspiration: browse the registries for other components and visual ideas
  when deciding how something could look, not only once you know what to
  add. Registries beyond shadcn's own are named in `components.json`'s
  `registries`: `@000h-cojeev` (000h.cojeev.com).
- **The `shadcn` skill** (`.claude/skills/shadcn/`, from `shadcn/ui`, kept
  as upstream ships it; `skills-lock.json`) loads on shadcn work. Its
  commands say `npx shadcn@latest`; run them as `npx shadcn@4.21.5` from
  `frontend/` (from the root they need `-c frontend`). Where it disagrees
  with this file or `design/DESIGN.md`, this repo wins: our tokens, and
  registry code restyled to them. Its sibling `migrate-radix-to-base` is for
  a move from `radix-ui` to Base UI, which nothing has decided.
- **Reach for `@000h-cojeev` first** (owner, 2026-10-19). Before building a
  new component, or a stock shadcn one, look for it there (the MCP, or
  `npx shadcn@4.21.5 search @000h-cojeev -q <word>` in `frontend/`) and start
  from its item when one fits; build your own only when none does, and say so
  in the PR. **Start from it by hand, never by `shadcn add`:** an item pulls
  its whole theme (dozens of files and CSS variables) and overwrites existing
  `src/ui/` files and `src/lib/utils.ts`. `view` it (the MCP, or `npx
shadcn@4.21.5 view @000h-cojeev/<item>`), then write it into `src/ui/`
  keeping its API and dropping its theme, restyled to our tokens, with a
  story; `src/ui/badge.tsx`'s header shows the result. For a stock shadcn
  component, `add` only after `--dry-run` (and `--diff` on a file that
  exists) shows it writes just that component.
- **A `notFound()` thrown in a layout skips that segment's own `not-found.tsx`** and lands on the parent's.
- **Never set `turbopack.root`, and never put a lockfile or `.git` in
  `frontend/`.** The tokens are read from `../design`, which only
  works while Turbopack's root is the repo root.
- **`design/` is read only through `@acme/design`'s exports**
  (`design/package.json`). Nothing else in `design/` is a dependency.
- **Contract values come from `@acme/contracts/client/*`; the main entry
  is for types.** `client/core` holds the constants and `buildPath`, and
  `client/public` (and any audience a project adds) one audience's routes
  each; a module imports only the audience it calls, never `@acme/contracts/client`
  (the whole table), so a page's bundle holds only the routes it calls. The main entry carries zod: one value import from it put zod
  into a page's bundle (23 KB of client JS became 141 KB). Lint enforces this
  outside tests, stories and `mock-route.ts`.
- **No git hooks.** beads owns `core.hooksPath`.

## Pinned on purpose

| Package           | Held at | Until                                                   |
| ----------------- | ------- | ------------------------------------------------------- |
| typescript        | 6.0.x   | typescript-eslint supports ≥ 6.1 (it requires `<6.1.0`) |
| vitest, @vitest/* | 4.x     | `@storybook/addon-vitest` supports Vitest 5             |
| @types/node       | 24.x    | CI's Node (`.nvmrc`) moves                              |
| pnpm              | 10.34.5 | the corepack shipped with Node can launch pnpm 12       |

Dependabot is configured to ignore exactly these updates.

## Open decisions

D1 (libraries), D2 (type steps below 16px) and D6 (language and direction) are
decided and wired in. D5 (visual regression) is not planned. D8 (real phones or
a device cloud, beyond emulation) is open and nothing is built for it. D7 (the
backend contract) is decided: see B8 in
`docs/decisions/2026-09-25-backend-decisions.md`. Libraries for each feature
are chosen when that feature is built. Deployment (D4, provisionally SST v4 +
OpenNext; the `dev` stage runs it, from `deploy/`) is still the owner's to
decide: `docs/decisions/2026-09-24-frontend-open-decisions.md`. Do not decide
it in passing.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
