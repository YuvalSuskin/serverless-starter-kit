# Frontend — decisions

**Opened:** 2026-09-24, during the frontend scaffold design
**Owner:** Yuval Suskin

The owner's calls about the frontend's libraries and tooling. Each section
records the question, the context, and the outcome. D3 (the source of a brand
asset's geometry) belongs to the first project's brand and is not part of the
template; its number is not reused.

When a decision is made, record the outcome here (a short "Decided:" line),
then close its bead.

> **Changed 2026-10-06.** Decisions now reach the owner in two ways. Between
> batches, through the owner's inbox page, a claude.ai artifact (its URL is
> recorded in the root `CLAUDE.md`): each item is a question with the agent's
> recommendation, and the owner answers it when they choose. Full drafts
> (specs, decisions with their reasons) go through review batches
> (`/review-batch`, `.claude/skills/review-batch/`). Either way, the agent
> applying the answer records the `Decided:` line here, posts the answer on the
> bead, and closes it.

| # | Decision | Priority | Blocks |
|---|---|---|---|
| D1 | Libraries for bespoke components, and icons (**decided**) | P2 | Adopting SWR, nuqs, Lucide; feature libraries wait for their feature |
| D2 | Type sizes below 16px (**decided**) | P2 | Using `text-075` / `text-050` |
| D4 | Deployment target (**provisional**: SST v4 + OpenNext) | P2 | Deploying; the image loader; ISR caching |
| D5 | Visual regression (**not planned**) | P4 | Nothing |
| D6 | i18n (**decided**: habits now, library later) | P4 | Nothing now; `next-intl` when a second language is asked for |
| D7 | Backend contract and monorepo tooling (**decided**, backend B8) | P3 | Nothing |
| D8 | Real phones or a device cloud, beyond emulation (**open**) | P3 | Nothing now; confidence in iOS-only behaviour |

---

## D1 — Libraries for bespoke components, and icons

**Question.** Which libraries back the bespoke components (those shadcn has no
equivalent for), and which icon set does the product use?

**Already settled by the scaffold spec:**

- **Motion is the only animation library.** It covers scroll-linked effects
  (`useScroll` / `useTransform`, using native `ScrollTimeline` where the
  browser supports it) and any player-style component.
- **Copied registry code is Tier 1 code.** It lives in `src/ui/`, and it
  needs a story, tests and a lint-clean right-to-left layout.
- **Directional icons mirror under right-to-left layouts.**
- **A "drawer" is native scroll-snap, not a drag-gesture drawer.** It does not
  need shadcn's Drawer, which depends on the unmaintained `vaul`.

**Rejected as stale:** `vaul` (its README says unmaintained). The other
libraries rejected for the same reason, for the first project's own features,
are not listed.

**Criteria:** right-to-left correctness; Motion-compatible (no second
animation library); maintenance activity; bundle weight on public pages;
accessibility.

**Decided:** 2026-09-24, Yuval Suskin.

- **Icons:** Lucide (`lucide-react`) as the base set; `@lucide-animated` for
  animated icons, copied in per icon. Not `@animate-ui`, whose repo looks
  stalled. Directional icons mirror under right-to-left layouts.
- **Animation:** Motion only.
- **Server state: SWR, not React Query.** Server components and server actions
  do most of the fetching; SWR covers the rest (polling, optimistic `mutate` with
  rollback, `useSWRMutation`, `useSWRInfinite`) and is lighter.
- **A domain-hook layer is required.** Hooks live in `src/lib/data/`
  (`useMessages`, `useSendMessage`, …). They return our own shapes, never SWR
  objects, and they wrap each domain operation rather than exposing a generic
  `useQuery`. ESLint `no-restricted-imports` bans `swr` outside
  `src/lib/data/`.
- **URL state:** `nuqs`, with its App Router adapter.
- **Registries:** none becomes a dependency. Individual components are copied
  into `src/ui/` when one fits, and they are Tier 1 code.
- **A hard requirement for every library, now and later:** it must be fully
  compatible with the Next.js App Router, running as a server component where
  possible and behind an explicit `'use client'` boundary where not, and
  `next build` and `next dev` must pass under Turbopack.
- **Deferred until each feature is built:** tables, phone numbers, QR, CSV/xlsx,
  virtualized lists, uploaders and similar feature libraries. Pick each one
  when its feature is built, against the criteria above.

---

## D2 — Type sizes below 16px

**Question.** Does the type scale get steps below 16px for UI text such as
captions, labels and metadata?

**Context.** The tokens define a √2 scale: 16, 22.6, 32, 45.3 and 64px. The
scaffold wipes Tailwind's default sizes and bans arbitrary values, so **the
frontend has nothing below 16px unless the tokens add it**. Mockups tend to
use 9–15px for timestamps, counts, badges and helper text; the tokens win, but
the need behind those small sizes is real.

**This is a `design/` decision, not a frontend one.** Whatever is decided goes
into `tokens.json`, and the frontend picks it up automatically.

**Decided:** 2026-09-24, Yuval Suskin. There are two new steps below 16px,
both derived from √2, for UI text only:

| Step | Size | Derivation | Use |
|---|---|---|---|
| `075` | 13.5px | 16 ÷ ⁴√2 (a half step) | captions, helper text, metadata |
| `050` | 11.3px | 16 ÷ √2 (a full step) | short labels only: counts, badges, timestamps. Never running sentences. |

- **Form inputs stay at 16px or more.** Below 16px, iOS Safari zooms the page
  when an input gets focus.
- **A display face keeps its own minimum size** (set with the face).
- **Sizes below the two steps are dropped,** not mapped to anything.
- Sizes are rounded to one decimal place, matching 22.6 and 45.3.

---

## D4 — Deployment target

**Question.** Where does the frontend deploy? Probably AWS, but in what form:
containers on ECS or App Runner, or OpenNext/SST?

**Context.** The scaffold sets no `output` mode. `output: 'standalone'` was
planned but removed during plan-time validation. `next start` rejects it with
a warning, and running the standalone `server.js` needs a step that copies
static assets first, which is a deployment concern. For containers on
ECS/App Runner, add `output: 'standalone'` together with that copy step and a
Dockerfile. For OpenNext/SST, the adapter owns packaging. The choice also
affects `images.loader` and ISR cache handling.

**Decided (provisional):** 2026-09-24, updated 2026-09-26, Yuval Suskin. SST v4
(`sst.aws.Nextjs`, which is OpenNext on Lambda, CloudFront and S3) in the
project's region. SST is pinned to an exact version and OpenNext through
`openNextVersion`. The rendering rules: public marketing pages are static,
pages that depend on live data render per request, and the signed-in app is
dynamic. Images never go through `next/image`'s optimizer. Reviewed on
2026-09-26 and rejected: Amplify and App Runner are not in every region;
`cdklabs/cdk-nextjs` needs Docker; plain Next.js standalone on Lambda Web
Adapter would mean banning Next's own caching.

_Region note:_ in a region without Lambda function URLs, SST's `Nextjs`
component refuses the region. The stack then runs the same pieces wired from
OpenNext's output, with each Lambda behind an API Gateway HTTP API, which
buffers responses (no streaming). If a first byte is too slow, try OpenNext's
streaming wrapper behind a REST API, then route splitting.

_Idle cost:_ nothing in the stack is billed by the hour. The Lambdas (no
provisioned or reserved concurrency, no VPC), the HTTP APIs, the CloudFront
distribution with its function and key-value store, and the DynamoDB table (on
demand) are billed per request. What stays while idle is stored bytes: the S3
buckets, the table and its point-in-time recovery, and the log groups. Small
fixed costs that come later (a hosted zone, about $0.50 a month; in
production, a WAF, about $5 a month plus $1 per rule) are named when they are
added.

---

## D5 — Visual regression

**Question.** Which visual regression tool, and when?

**Context.** It was left out of the scaffold deliberately. Right-to-left-first
UI churns heavily early on, and every layout change becomes a diff to review,
which invites rubber-stamping. It is also the most expensive CI addition
available. The stories it would test already exist, since every `src/ui/`
component needs one.

**Options:** Chromatic (hosted, paid, good review workflow); self-hosted
Playwright screenshot diffs (free, but costs CI minutes, adds weight to the
repo, and is flaky across operating systems and font rendering, especially
with a custom font); Storybook's own tooling.

**Decided:** 2026-09-24, Yuval Suskin: **not planned.** No tool and no trigger
are set. The scaffold keeps a story for every `src/ui/` component, so adding a
tool later needs no new stories.

---

## D6 — i18n

**Question.** Which library and routing model to use when the product goes
multilingual?

**Context.** The product starts in one language. `<html lang dir>` is
hard-wired, and right-to-left-correct CSS is enforced by lint, which is the part
that would be expensive to retrofit. There is no i18n framework and no string
table. Decide: the library, locale in the path versus the domain, and how
`dir` gets derived per locale.

**Decided:** 2026-09-24, Yuval Suskin. **No i18n library now.** Instead, three
nearly free habits keep going multilingual cheap later:

1. **Format only through `Intl`.** Dates, times, numbers, relative times and
   plurals use `Intl.DateTimeFormat`, `NumberFormat`, `RelativeTimeFormat` and
   `PluralRules`. Never format by hand, and never hard-code month or day names.
2. **`src/lib/locale.ts` is the only source of the locale and the
   direction.** The root layout's `<html lang dir>` and every `Intl` call read
   from it. Nothing else hard-codes a language or a direction.
3. **Whole sentences only.** User-facing text is never assembled from pieces
   (such as a count joined to a noun). Write complete sentences, and pick
   plural forms with `Intl.PluralRules`.

Where it's cheap, lint enforces these; otherwise they are conventions in
`frontend/CLAUDE.md`.

**Deliberately not now: message files.** Every user-facing string is in the
product's language and the code is in English, so a search for that language's
characters finds every string later, and a script can extract them.

**Plan for later.** The trigger is users asking for a second language. Use
`next-intl`, with the first language as the default without a URL prefix,
other locales under `/<locale>/...`, and `dir` derived from the locale.
Migrate by scripted extraction, translation, then one visual pass of every
screen in both directions.

---

## D7 — Backend contract and monorepo tooling

**Question.** When `backend/` (Node/TS) lands, how do the frontend and the
backend share types, and does the monorepo adopt more tooling?

**Decided (partly):** 2026-09-24, Yuval Suskin.

- **Settled:**
  - Clients are **web only** for now.
  - The contract is **zod schemas shared by frontend and backend, plus typed
    fetch calls.** No tRPC. OpenAPI generation from the same schemas comes
    only if a native app or a third-party consumer appears.
  - **`packages/contracts` is created at backend kickoff,** not before.

**Decided (the rest):** 2026-09-25, Yuval Suskin, at backend kickoff. Recorded
as B8 in [`2026-09-25-backend-decisions.md`](2026-09-25-backend-decisions.md).

- The first contract is the `access` route, with `health`.
- MSW for tests, with handlers built from the contracts (`mockRoute`), which
  validate every mock. Storybook gets MSW with its first story that needs data.
- Turborepo now, local cache only.
- Shared ESLint base and tsconfig in `packages/config`; Prettier stays at the
  root.
- `@acme/contracts` has a zod-free `client` entry: the frontend imports
  values only from it, so zod never reaches a page bundle.

---

## D8 — Real phones or a device cloud

**Question.** Should phones be tested on real devices, beyond emulation?

**Context.** Every e2e test runs on an emulated iPhone 15 (WebKit) and Pixel 7
(Chromium), and stories can opt into the Pixel 7. Emulation is not a phone: it
misses iOS Safari's real toolbar and viewport resizing, the share sheet, real
touch latency and momentum scrolling, and the memory limits a large page
meets. Playwright's WebKit is also not Safari itself.

**Options:** a device cloud (BrowserStack, Sauce Labs, LambdaTest: real
phones driven from CI, at a monthly cost); a short manual check on real
phones before each release (a person's time, no tooling); or neither, for
now.

**Status:** open. Nothing is built. Worth deciding before the public pages
reach real users.
