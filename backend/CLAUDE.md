# backend/

The Acme API: one Hono app, built from sub-apps per audience (`public` today),
deployed as one Lambda. DynamoDB for data. Locally and in CI it runs entirely
on a laptop; deployed, it is `dist/api.mjs` behind an API Gateway HTTP API
(SST, in `deploy/`; runbook `docs/runbooks/deployment.md`). The owner's
decisions, and the ones still open, are in
`docs/decisions/2026-09-25-backend-decisions.md`.

**What is here is a skeleton.** One demo domain, contact messages (a visitor
writes one, the owner is mailed it, an app page lists the stored ones), has one
of each layer, so every check has something to check: the route
(`src/api/public/routes.ts`), its two use cases (`src/domain/messages/`), the
`MessageStore` port with its fake and its DynamoDB adapter, the `Mailer` port
with its fake and its SES adapter, a dev seed and a dev mailbox. Each file is
marked `Skeleton:` in a header comment; bootstrap step 6 replaces them with the
project's own. The rules below are the template's, and hold for the code that
replaces the skeleton.

## The loop

```bash
pnpm fix      # eslint --fix, then prettier --write
pnpm check    # format, lint, types, knip, unit + contract + bundle tests -- what CI runs
```

Run `fix`, then `check`. Whatever `check` still reports needs a human
decision. **Never claim a task is done while `check` is red.** CI only checks;
it never fixes.

| Command              | What                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`           | The API on http://127.0.0.1:8787 (`DEV_API_PORT` changes the port), in memory, seeded (see "Local development")                |
| `pnpm test`          | Unit tests, sweeps and rule tests, on fakes. Seconds; no Docker                                                                |
| `pnpm test:contract` | Every adapter against its emulator: DynamoDB Local; the mailer against a local stand-in of SES's API. **Needs Docker running** |
| `pnpm build`         | Bundles the Lambda: the API into `dist/api.mjs`                                                                                |
| `pnpm test:bundle`   | Tests the built bundle: smoke, fails closed, no fakes, size budgets, AWS SDK errors told apart once minified                   |

`pnpm build` splits each bundle: what its entry imports only dynamically is in
`dist/chunks/<entry>/`, which ships in the function's folder beside it, so a
cold start loads less. A rarely used SDK client the API wires
(SES) is imported on first use (`src/platform/once.ts`), and the API's cold
start makes its first DynamoDB call itself.

All of these work from the repo root and from `backend/`. From the root,
`pnpm dev` starts the API and Next.js together; Next proxies `/api/*` here.

## Where does this go?

Every layer is a folder. `eslint-plugin-boundaries` enforces the right-hand
column; tests (`*.test.ts`, `tests/`) may import anything. This table is a
convention: if a feature needs a direction it does not allow, change it
openly (see "When a rule is in the way").

| You are adding                                                  | It goes in                                                           | It may import                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A business rule (a use-case)                                    | `src/domain/<area>/<use-case>.ts`, one per file, with a sibling test | `domain`, `platform`, `@acme/contracts`                            |
| A type or port (interface) shared by use-cases                  | `src/domain/*.ts` (no logic here)                                    | same                                                               |
| A small pure helper                                             | `src/domain/lib/` (`escape-html.ts` is the example)                  | same                                                               |
| Something every layer needs (config, errors, logging, metering) | `src/platform/`                                                      | `platform` only                                                    |
| A real implementation of a port (DynamoDB, SES, ...)            | `src/adapters/<port>/`                                               | its own folder, `domain`, `platform`                               |
| A fake implementation of a port                                 | `src/fakes/<port>.ts`                                                | `fakes`, `domain`, `platform`                                      |
| A route                                                         | `src/api/<subapp>/routes.ts`                                         | `api/http`, `domain`, `platform` -- never another sub-app          |
| HTTP plumbing shared by the sub-apps                            | `src/api/http/`                                                      | `api/http`, `domain`, `platform`                                   |
| Wiring for production                                           | `src/entries/lambda/` -- the only place remote adapters are wired    | `api/app`, `adapters`, `platform`                                  |
| Wiring for `pnpm dev`                                           | `src/entries/dev/` -- the only production-tree code that uses fakes  | `api/app`, `domain`, `fakes`, `platform`, and the `random` adapter |

`src/api/app/` is the one place that sees every sub-app.

The skeleton has no queue worker, scheduled job, sign-in trigger or
authorization layer, so it has no folder for one. The first of each adds its
folder, its row in this table and its layer in `eslint.config.mjs` together,
with the probes that pin them in `tests/rules/lint-rules.test.ts`, and brings
the rules that go with it (see "Adding what the skeleton lacks").

## How a request flows

Before any route: with `ORIGIN_SECRET` set (every deployed stage), a request
without the matching `x-origin-secret` gets **403** on every path, so only
CloudFront and the site's server render reach the API, never a caller of an
API Gateway address (`src/api/app/create-app.ts`). Unset, as in `pnpm dev` and the tests, nothing is refused there.

`definePublicRoute` (in `src/api/http/define-route.ts`) does all of this, so a
route file only declares:

1. Path params, query and body are parsed: **400**, with `details` naming each
   field. A body that is not JSON is **415**, so a form on another site cannot
   post to a route.
2. The use-case runs with the app's `deps`. A route about one unit sets it
   first (`extendLogContext({ unitId })`), so its usage records and log lines
   are attributed to it.
3. The output is parsed against the contract **in production too**: fields
   the contract does not declare are dropped, so nothing internal leaks.
4. An answer that does not say how it may be cached carries
   `Cache-Control: no-store`: a shared cache never keeps it.

A request body over 64 KB is refused (413).

Every response carries `x-correlation-id`, and every log line carries it plus
the stage, the route and, once known, the unit.

## Recipes

**Add a route**

1. Add its method and path to its audience's zod-free table in
   `packages/contracts/src/client/public.ts` (a new audience gets a file of its
   own beside it), then its contract (input, output, errors) in
   `packages/contracts/src/routes/public.ts`, spreading the table entry.
   `errors` starts from `...PUBLIC_ROUTE_ERRORS`, or `...PUBLIC_INPUT_ROUTE_ERRORS`
   when the route takes a body or a query: every code the API can answer with.
2. Write the use-case in `src/domain/<area>/`, with its sibling test.
3. Register it in `src/api/<subapp>/routes.ts` with `definePublicRoute({
contract, example, handler })`. `example` is the input the sweeps send.
4. That's all. **Do not write tests of what the sweeps cover**: the sweeps in
   `tests/sweeps/routes.test.ts` now cover it (200 with the contract's
   output, log context on every line, every usage line on a unit,
   `no-store`, and 415 for a body that is not JSON), and the
   contract-completeness sweep fails if the contract has no route or Hono
   serves anything that is not a registered route.

**Add a use-case**: one file in `src/domain/<area>/`, `(deps, input) =>
result`, with a sibling `*.test.ts` (the structure test fails without one).
Time and ids come only from `deps.clock` and `deps.ids`.

**Add a port and its adapter** (a resource, so the root `CLAUDE.md`'s _Local first_ rule applies: fake, suite, seed, dev page, and a meter if it is paid)

1. The interface in `src/domain/ports.ts`.
2. The fake in `src/fakes/<port>.ts`, the real one in `src/adapters/<port>/`.
3. One shared suite `tests/contracts/<port>.contract.ts`, run by
   `<port>.fake.test.ts` (unit) and `<port>.emulator.test.ts` (contract). The
   structure test fails if any of the three is missing, and until the
   adapter's files are listed under their suite in `ADAPTER_SUITES`
   (`tests/rules/structure.test.ts`). The same file fails an adapter folder
   with no fake, no contract suite or no wiring in `src/entries/dev`; a folder
   whose fake has another name goes in its `FAKES_OF`.
4. Put the emulator wiring in `tests/contracts/on-emulators.ts`, export the
   adapter from `tests/contracts/bundled-adapters.ts`, and call the runner in
   `tests/contracts/bundled.emulator.test.ts` too: the suite then also runs on
   the adapter as esbuild bundles it for the Lambda. Assert refusals by their
   error `code`, not `toBeInstanceOf`: the bundle has its own copy of the
   classes.
5. Wire the real one in `src/entries/lambda/api.ts`, and the fake, seeded, in
   `src/entries/dev/server.ts` (a resource with effects a person would want to
   see gets a dev page, as `src/entries/dev/dev-mail.ts` does). The bundle
   tests fail until every real adapter is in the bundle (`dist/meta.json`).

A port with no remote service (a local library) needs no fake: its real
adapter runs in every test, `pnpm dev` included, and its suite runs in the
contract project.

**Add a paid external call** (mail, an AI service, ...): its adapter records a
usage meter against the unit it is for, and its contract suite asserts that it
does. Add the meter to the catalog in `src/platform/usage.ts` first, with its
comment: who records it, and what the provider bills for it.

**Send an email**: through the `Mailer` port (`src/domain/ports.ts`; email
channel design). Its words are a pure function next to the use-case that sends
it (`src/domain/messages/send-message.ts` is the example): one address, a text
version and an HTML version that escapes what a visitor typed, no image. It
goes on a stream (`team` or `notices`, which decides what SES suppresses), and
the SES adapter meters `email.sent`. A stage sends only with `EMAIL=on` and its
`EMAIL_*` settings (`src/platform/config.ts`); the sender shows as
`EMAIL_FROM_NAME` (`Acme` by default). `pnpm dev` keeps what it sends at
`/api/dev-mail` (and `/api/dev-mail/sent.json` for a test).

**Add a metric**: declare it in `src/platform/metrics.ts` first. Dimensions
are fixed lists of values, never ids: each distinct value is billed as a
separate metric, and the types reject an id.

## Adding what the skeleton lacks

Each of these brings its own folder (see "Where does this go?"), and the rules
below with it. They are rules now, so the first one is built to them.

- **A queue worker** (`src/workers/<name>.ts`) is built through a
  `defineWorker({ name, message, idempotencyKey, unitId, handler })` in
  `define-worker.ts` in that folder. It wraps every delivery in an envelope
  (`{ correlationId, messageId, payload }`, so the correlation id follows the
  work from the API through the queue), parses the payload against the
  message schema (`Invalid` when malformed), and runs the handler inside
  `withLogContext({ correlationId, unitId, principal: "system", worker: name })`
  (add `worker` back to `LogContext`). A `Worker` exposes `handle(delivery,
platform)`, `idempotencyKey`, `message` and `name`. All workers are
  factories `(deps) => Worker` listed in `registry.ts` there
  (`allWorkers`), because a worker closes over its stores. Add with it, in
  the same change:
  - **The idempotency sweep**, `idempotency.ts` in `tests/sweeps/`, exporting
    `expectIdempotent({ messages, setup, snapshot, worker })`. It asserts at
    least two related messages were given; then runs the worker in a fresh
    `fakePlatform()` world three ways (the messages in order; every message
    delivered twice; the messages reversed), each delivery as
    `{ correlationId, messageId: worker.idempotencyKey(payload), payload }`,
    and expects the `snapshot(world)` of all three to be equal (failure
    messages "delivered twice" and "delivered out of order"). Its own test
    (`idempotency.test.ts`) proves it on three probe workers: a set of ids
    passes, a delivery counter fails "delivered twice", a "last message
    wins" worker fails "out of order"; and that the handler runs inside the
    worker's log context.
  - **A structure test** in `tests/rules/structure.test.ts`: every
    `src/workers/*.ts` that is not a test, `define-worker`, `registry` or a
    scheduled job has exactly as many files as `allWorkers`, and each has a
    sibling test that contains `expectIdempotent(`. A scheduled job (a sweep
    on a rule; it takes no queue message) is listed in a
    `SCHEDULED_JOBS` record with the reason it needs no idempotency test.
  - **The lint config**: a `workers` layer in `eslint.config.mjs` (may import
    `workers`, `authz` when it exists, `domain`, `platform`; the dev entry
    may import it to run workers in process), its probe in `lint-rules.test.ts`,
    and `expectIdempotent` in the `assertFunctionNames` of the
    `vitest/expect-expect` rule so a test that calls it counts as asserting.
  - **The wiring**: its Lambda is an SQS handler in an entry beside `api.ts`,
    built by `scripts/build.ts`, with its own bundle test.

  Anything that must not be lost (a message to the next queue) goes before the
  step that ends the work: a redelivery after it is dropped. A new message
  kind is deployed to the worker before any route sends it, or it would
  dead-letter.

- **Authorization** (an `authz` layer, a folder of that name, between `api/http` and
  `domain` in the table and in `eslint.config.mjs`) answers with the unit's
  data hidden: a caller with no access to a unit at all gets **404**, never
  403, so it cannot learn the unit exists; one with access but not this
  permission gets **403**. A route is metered only after the check passes: a
  refused call is never charged to a unit. Code checks **permissions**, never
  role names; the role-to-permission map lives in one file and the `Role` and
  `Permission` enums in `@acme/contracts`. The route builder (one per kind of
  route, beside `definePublicRoute`) runs, in order: anonymous is **401**
  `unauthenticated`; path params are parsed; the check; the call is metered;
  query and body are parsed; the handler runs with stores already scoped to
  the unit; the output is parsed. The first route behind it adds the **isolation
  sweep** to `tests/sweeps/routes.test.ts`, written once and applied to every
  such route, asserting:
  - an anonymous caller gets 401 `unauthenticated`, and the contract's
    `errors` lists it;
  - a caller with the permission gets 200 and the contract's output, exactly
    one `api.call.*` usage line, and every usage line carries the unit;
  - every log line carries the correlation id and the unit, and the principal
    is not `anonymous`;
  - for each role lacking the permission, 403 (skip the routes every role
    holds);
  - the answer carries `Cache-Control: no-store` when it belongs to one
    signed-in account;
  - a caller of another unit gets 404 `not_found` (never 403, never data), the
    contract lists `not_found`, and **no usage line is written** for the
    refused call;
  - a route about the signed-in account itself (no unit in its path) gets 401
    anonymous with no usage line, meters to the account, and never answers
    with another account's unit;
  - an expired session gets 401 `session_expired` on every such route, and the
    contract declares it (add the code back to `ErrorCode`).
    Add the test helper that sends a request as a named caller (`Caller`) to
    `tests/support/test-app.ts`.
- **Sign-in** identifies its caller through a verified credential only. A
  session is opened after the identity provider's token was verified, and a
  stage without its settings denies all. Cookies carry the `__Host-` form with
  `Secure` in the Lambda and a plain form on the loopback dev server. The
  dev server runs the real client against a fake identity provider, and the
  bundle test asserts that a stage without its settings refuses sign-in and
  that the sign-out cookie is cleared in its `__Host-` form with `Secure`.
- **Deleting a unit** (a lifecycle) hides it first: a unit whose deletion
  began is absent for every route and every worker, through a gate that wraps
  the store (`hideErased`); only the deleting job reads the plain store.
  The rule test `erased-gate.test.ts` in `tests/rules/` asserts that every worker
  that reads the unit's store does so through the gate (listing the few that
  do not read one, each with its reason), that `createApp` hands every route
  the gated store, and that any other reader (a preview, say) gates its store
  too. A source scan like this one always has a companion check that its
  pattern matches the code it hunts, so a rename cannot silence it. Anything a
  unit owns goes in its partition or names it, so the deleter finds it.
- **An object store** is reached through named targets, never bucket names,
  with plain object operations only. Every key starts with the unit's prefix, so
  deletion lists by it and bytes stay attributable. A browser uploads only
  through a presigned URL fixed in key and type and bounded in size and
  lifetime; `getSignedUrl` signs GETs only. Every `put` is metered by the
  adapter as bytes, to the unit in the log context. The S3 client keeps
  `requestChecksumCalculation: "WHEN_REQUIRED"`: the SDK's default writes an
  empty body's checksum into every presigned PUT, so every upload through one
  fails. Its contract suite runs on the fake, on an S3-compatible emulator and
  on the adapter as bundled, like the message store's. The emulator is a
  second container in `tests/contracts/emulators.ts`, beside DynamoDB Local:
  SeaweedFS (`chrislusf/seaweedfs`, tag pinned, `4.47` was used) started with
  `server -s3 -s3.config=/etc/seaweedfs/s3.json -dir=/data -volume.max=32
-master.volumeSizeLimitMB=64`, port 8333, and an identity file with test
  credentials copied in, so every signature is really checked and a tampered or
  expired signed URL is refused. The two volume flags matter: left alone, the
  volume limit is free disk over 30 GB, so a CI runner fits only two buckets
  and every write to the third is an `InternalError`. The gateway accepts
  connections a moment before it is ready, so creating the buckets retries
  (up to 40 times, 250 ms apart). The endpoint is handed to the suites with
  `project.provide`, and the client uses path-style addressing.
- **A list route** returns `Page<T>` (`page()` from `@acme/contracts`), with
  cursors from a `src/platform/` module: opaque, bound to the unit or account
  they were issued for, and decoded against the exact key shape the store
  issues, so an edited cursor is a 400, never a 500. A page limit below 1 is a
  400 too.
- **A secret a caller holds** (a link code) travels in a header, never in a
  path, so it stays out of access logs; and it is never logged. The route
  sweep asserts, for every route that takes one: the route has no unit id in
  its path, query or body (the code picks the unit); an unknown or revoked
  code is 404 and counts against the caller's address; built-in object names
  (`constructor`, `toString`, `__proto__`, `hasOwnProperty`) are not taken for
  a code; and no log line contains the code, known or not.
- **A new index on a deployed stage** needs a one-off backfill run through
  `deploy/` before anything reads it.

## Tests

| Tier        | What                                | How                                                                   |
| ----------- | ----------------------------------- | --------------------------------------------------------------------- |
| 1: sweeps   | contracts, the request pipeline     | written once in `tests/sweeps/`, applied to every route automatically |
| 1: adapters | `src/adapters/`                     | one shared suite per port, against the fake **and** the emulator      |
| 2: domain   | `src/domain/<area>/` use-cases      | a sibling `*.test.ts`, against fakes                                  |
| 3: plumbing | route declarations, entries, config | no hand-written tests; the sweeps and the bundle tests cover them     |

| Vitest project | Runs                                                      | Needs              |
| -------------- | --------------------------------------------------------- | ------------------ |
| `unit`         | domain tests, sweeps, fake runs of the suites, rule tests | nothing            |
| `contract`     | the suites against DynamoDB Local and the SES stand-in    | Docker             |
| `bundle`       | `dist/api.mjs`                                            | `pnpm build` first |

- **A fake is only as good as its contract suite.** If a suite passes on the
  fake and fails on the emulator, fix the fake: it has drifted from reality.
- **No `vi.mock`.** Replace things through `deps`. A test that needs
  `vi.mock` points at a missing port. The one exception: an adapter's own
  tests may mock the SDK it wraps, never one of our modules.
- **No snapshot tests of API responses.** The contract schemas are the contract.
- **A bug fix starts with a failing test** that reproduces the bug.
- **`test:contract` never skips.** Without Docker it fails, with a message
  saying so. A skipped suite is a false green.
- **No coverage threshold.** The tiers and sweeps are the bar.

## Reading a red `check`

| It says                                                                                           | It means                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| route sweep: a usage line has no `unitId`                                                         | a route metered a call without setting its unit; `extendLogContext({ unitId })` first, in the handler                                           |
| route sweep: not `no-store`, or no 415                                                            | a route left `definePublicRoute`; use it                                                                                                        |
| route sweep or `contracts.test.ts`: an undeclared error code                                      | the contract's `errors` must spread `PUBLIC_ROUTE_ERRORS` (or `PUBLIC_INPUT_ROUTE_ERRORS`)                                                      |
| contract completeness                                                                             | a contract has no route, two routes, or a route has no contract                                                                                 |
| contract completeness: Hono serves an unregistered route, or an ALL handler beyond the middleware | a handler was registered straight on Hono (`app.get`, `app.all`); register it through `definePublicRoute`                                       |
| `tests/api/http.test.ts`: 415, correlation id, `stage`                                            | the request pipeline in `src/api/app/create-app.ts` or `src/api/http/define-route.ts` changed; every line and every error must keep its context |
| structure: use-case without a test / fake without a suite                                         | add the missing file; if it genuinely needs none, exempt it in `tests/rules/structure.test.ts` with the reason                                  |
| structure: an adapter no suite exercises                                                          | list its files under their suite in `ADAPTER_SUITES`, and import them in that suite's emulator test                                             |
| `boundaries/dependencies`                                                                         | an import crosses a layer the wrong way (see "Where does this go?")                                                                             |
| `tests/rules/lint-rules.test.ts`                                                                  | a lint rule stopped firing (a plugin upgrade, a config edit). If you changed the rule on purpose, update its probe with it                      |
| bundle: over budget                                                                               | a dependency grew the Lambda; find it in `dist/meta.json` before raising the budget                                                             |
| bundle: contains a fake                                                                           | a fake reached production code                                                                                                                  |
| bundle: an adapter is not wired                                                                   | wire every real adapter in `src/entries/lambda/api.ts`, so the bundle is what production runs                                                   |
| bundle: a CommonJS build of a package that ships an ES module one                                 | the esbuild options in `scripts/lambda-build.ts` lost `mainFields`                                                                              |
| contract suite passes on the source, fails as bundled                                             | bundling broke the adapter (or the suite compared classes by identity: assert the error `code`)                                                 |

## When a rule is in the way

A red check, or a rule that seems to block a design, means one of two things.
Both are legitimate outcomes:

1. **The change broke what the rule protects.** Fix the change.
2. **The rule is wrong for what you are building.** Say so. Stop, explain
   what it blocks and why the design needs that, and propose changing the
   rule. For a **convention** (below) that is a normal part of the work:
   change the rule, its test and this file together, in the open, with the
   reason in the PR. For an **invariant**, ask the owner first.

What is never acceptable is the quiet route: weakening a test to go green,
exempting something without saying why, or bending a design to fit a rule
nobody questioned. A rule that looks like a dead end is a question to raise,
not a wall to route around.

## Invariants

These protect users and their data. Changing one is the owner's decision.

- **Another unit's data is invisible.** A route that works on a unit's data
  checks the caller's access first (see "Adding what the skeleton lacks"):
  no access is **404**, never 403 and never data, so a caller cannot learn
  another unit exists. The first route behind an `authz` layer adds the
  isolation sweep that asserts it for every route (also under "Adding what
  the skeleton lacks"). The
  skeleton's routes all belong to the one `demo` unit and are public; a real
  project replaces them (bootstrap step 6) before anything is deployed to users.
- **No personal data in logs.** Never log request or response bodies, names,
  phones, emails, addresses, locations or secrets a caller holds: log ids and
  counts. Log through `deps.log`: every line then carries the correlation id,
  the principal and the unit, and the logger redacts keys named after personal
  data as a backstop, not as permission.
- **Nothing deployed trusts an unverified identity claim.** The fakes believe
  whatever a request says, so they are never deployed: the bundle test fails
  if one reaches `dist/`, and the dev server listens on `127.0.0.1` only.
  A caller is identified only through a verified credential.
- **Every paid call is metered to a unit** through `deps.usage`, and only
  after the caller is allowed: a refused call is never charged. A usage record
  without a unit throws (`src/platform/usage.ts`); a cost that belongs to no
  unit is recorded as a shared cost, never left out.
- **Fakes behave like the real thing.** Each port's contract suite runs on
  the fake, on the emulator, and on the adapter as bundled. If it passes on
  the fake and fails on the emulator, fix the fake: it has drifted. A port
  with no remote service has no fake to drift: its suite runs on the real
  adapter, from source and as bundled.

## Conventions

How the scaffold does things today, with the reason for each. They hold until
something better is needed; then change them openly, as above.

- **Only `platform/config.ts` reads the environment** (no `process.env`,
  `node:process` or `globalThis.process` elsewhere): everything else takes a
  parsed `Config`, so a missing variable fails at cold start, not
  mid-request.
- **Time and ids come from `deps`** (`Date.now()`, `new Date()`, `Date()`,
  `performance.now()`, `Math.random()`, and importing `node:crypto` or `uuid`
  are lint errors in `src/domain/`), so tests are deterministic and expiry
  logic can be tested by moving a fake clock.
- **Vendor SDKs (`@aws-sdk/*`, Powertools) are imported only in
  `src/adapters/`**, behind a port, so the fakes keep describing production.
- **One use-case per file in `src/domain/<area>/`, each with a sibling
  test.** Business rules are where tests pay off most.
- **Errors carry a code, never text.** Throw `NotFound`, `Forbidden`,
  `Conflict`, `Invalid` or `Unauthenticated` from `src/platform/errors.ts`;
  `src/api/http/errors.ts` is the only place they become HTTP. The frontend
  turns codes into sentences in the project's language.
- **Timestamps in every contract are UTC ISO-8601 strings**; the frontend
  formats them for the reader's time zone with `Intl`. **Every list route
  returns `Page<T>`** (see "Adding what the skeleton lacks").
- **Once deployed, API changes are additive only.** A browser tab can stay
  open for days: remove a field or route in two steps (the frontend stops
  using it, then the backend drops it). The `dev` stage is deployed.
- **A unit's data is found by the unit.** An item a unit owns goes in its
  partition (`UNIT#<id>`) or names it with a `unitId` attribute, so one query
  finds it and deleting the unit can find all of it; a file goes under a key
  that starts with the unit.
- **DynamoDB items are parsed when read** and carry a `schemaVersion`; updates
  are conditional on a `version` attribute, so a lost race is a `Conflict`,
  never a silent overwrite.
- **`import * as z from "zod"`**, never `import { z }`: the named import
  bundles all of zod's locales (a third of the Lambda).
- **The bundle budget** (`tests/bundle/api.test.ts`) is a tripwire, not a
  limit: raise it with the reason when a dependency is worth its size.

## Local development

`pnpm dev` runs the whole API in memory on fakes, seeded from
`src/entries/dev/seed.ts`: the demo unit's three messages, so the list is
never empty. A message sent through the API is mailed to `DEV_OWNER_EMAIL`
(`owner@example.test` by default) by the fake mailer, which keeps it at
`/api/dev-mail` (and `/api/dev-mail/sent.json` for a test); nothing is sent
anywhere. No Docker, no AWS. `src/entries/dev/server.ts` wires it, and a
resource added later is wired there too, seeded, with a dev page when it has
effects a person would want to see.

The fakes trust whatever the request claims, which is why they never leave
your machine (see "Invariants").

## Open decisions

The owner's, not yours. Which are decided and which are still open is the
_Open_ table in `docs/decisions/2026-09-25-backend-decisions.md`: a decided
one is marked "(**decided**)" there, with a "Decided:" entry under its
heading and its full record on its bead (`bd comments <bead>`); an open one
is a deferred bead under the "Backend open decisions" epic.

**Do not decide one in passing**; if a task needs one, stop and ask.
