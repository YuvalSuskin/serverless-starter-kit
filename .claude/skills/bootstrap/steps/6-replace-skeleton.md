# Step 6: Replace the skeleton

The skeleton is the template's demo: a contact form that stores messages and
mails the owner, one page of each kind, and the deploy that ships them. It
exists so every check has something to check. This step takes it out and puts
the project's first real feature in its place, in one change.

**Needs:** steps 1 to 5 done, and the first real feature ready to build: its
spec approved, its technical design written
(`docs/superpowers/specs/CLAUDE.md`) and its plan
(`docs/superpowers/plans/CLAUDE.md`). Until then this step waits; step 7 can
run meanwhile, and `pnpm sst:deploy` and the deploy workflows refuse until
this step is done (`deploy/src/bootstrap-guard.ts`).

**Fills:** no `fills.json` token. It removes the `Skeleton:` marker from every
file below.

**Never deploy the skeleton.** Its demo routes are unauthenticated: `GET`
lists every message anyone sent, and `POST` takes messages with no pacing.
They are there to be replaced, not shipped; if a stage was deployed with them,
remove that stage (`docs/runbooks/deployment.md`, _Tear down a throwaway
stage_) or deploy this step over it before anyone else has the address.

## Asks

1. **Which spec is the first feature,** if more than one is approved and
   planned. Recommend the one whose resources replace the demo's most
   directly (a table, a public page, a signed-out app page).
2. **Whether the first feature sends mail.** If not, the mail pieces go with
   the demo (the `mailer` dependency, `email.ts` in `deploy/src/` and the dev
   mail page), and come back with the first feature that sends mail.

## Writes

Every file that carries the marker, with what happens to it. Build the first
feature by its plan as you go: an **edit** row is where its code lands.

- **delete:** the file goes, with its story; nothing takes its exact place.
- **edit:** the demo's part goes and the first feature's takes its place;
  the marker goes with the demo's lines.
- **keep:** the file is the project's now; only the marker word goes from
  its comment, which keeps its explanation.

| File                                                            | Action | Then |
| --------------------------------------------------------------- | ------ | ---- |
| `CLAUDE.md` | edit | the paragraph on the skeleton under _What this repo is_: say what the app is instead |
| `backend/CLAUDE.md`                                             | edit   | the paragraph on the skeleton's marked files: say what the project's code is instead |
| `backend/src/adapters/dynamodb/message-store.ts`                | delete | the demo's DynamoDB adapter |
| `backend/src/api/http/types.ts`                                 | edit   | remove `messages` and `ownerAddress`; keep `mailer` only if a feature sends mail |
| `backend/src/api/public/routes.ts`                              | edit   | the demo routes go; the first feature's routes take their place |
| `backend/src/domain/lib/escape-html.ts`                         | delete | unless the new code uses it (knip says); then keep it, without the marker |
| `backend/src/domain/messages.ts`                                | delete | the demo's domain and `DEMO_UNIT` |
| `backend/src/domain/messages/list-messages.test.ts`             | delete | the demo's use case test |
| `backend/src/domain/messages/list-messages.ts`                  | delete | the demo's use case |
| `backend/src/domain/messages/send-message.test.ts`              | delete | the demo's use case test |
| `backend/src/domain/messages/send-message.ts`                   | delete | the demo's use case |
| `backend/src/domain/ports.ts`                                   | edit   | the `MessageStore` port goes |
| `backend/src/entries/dev/seed.ts`                               | edit   | the demo's messages go; the first resource's seed takes their place (local first, part 4) |
| `backend/src/entries/dev/server.ts`                             | edit   | the demo's store and owner address go from the dev wiring |
| `backend/src/entries/lambda/api.ts`                             | edit   | the demo's store and mail go from the Lambda wiring |
| `backend/src/fakes/message-store.ts`                            | delete | the demo's fake |
| `backend/src/platform/config.test.ts`                           | edit   | the owner-address tests go |
| `backend/src/platform/config.ts`                                | edit   | `OWNER_EMAIL`, `DEV_OWNER_EMAIL` and `ownerAddress` go |
| `backend/src/platform/usage.ts`                                 | edit   | `messages.write_units` goes; `example.shared` stays until the first real shared meter replaces it |
| `backend/tests/contracts/bundled-adapters.ts` | edit | the demo store's adapter goes; the first store's takes its place |
| `backend/tests/contracts/bundled.emulator.test.ts` | edit | runs the first store's suite on the bundle instead of the demo store's |
| `backend/tests/api/messages.test.ts`                            | delete | the demo routes' tests |
| `backend/tests/api/http.test.ts` | edit | the cases that call the demo routes call the first feature's; the HTTP behaviour they test stays |
| `backend/tests/api/seed.test.ts` | edit | tests the first resource's seed |
| `backend/tests/contracts/message-store.contract.ts`             | delete | the demo store's contract suite |
| `backend/tests/contracts/message-store.emulator.test.ts`        | delete | the suite on DynamoDB Local |
| `backend/tests/contracts/message-store.fake.test.ts`            | delete | the suite on the fake |
| `backend/tests/contracts/on-emulators.ts`                       | edit   | `messageStoreOnEmulator` goes; the first store's emulator runner takes its place |
| `backend/tests/rules/lint-rules.test.ts` | edit | the allowed import names one of the first feature's use cases; the rule is unchanged |
| `backend/tests/rules/structure.test.ts` | edit | the demo entries (`message-store` in `ADAPTER_SUITES`, `dynamodb` in `FAKES_OF`) become the first store's; `mailer` and `ses` stay if the mail pieces stay. The rules are unchanged |
| `backend/tests/support/test-app.ts` | edit | the demo store and its seed go; the first feature's store takes their place |
| `packages/contracts/src/client/public.ts`                       | edit   | the demo routes go from the public audience |
| `packages/contracts/src/message.ts`                             | delete | the demo's message schema |
| `packages/contracts/src/routes/public.ts`                       | edit   | the demo route contracts go |
| `frontend/e2e/budgets.ts`                                       | edit   | `PAGES` lists the project's pages; the tiers are re-measured |
| `frontend/e2e/laptop.spec.ts`                                   | edit   | the page list becomes the project's |
| `frontend/e2e/mobile.spec.ts`                                   | edit   | the page list becomes one page of each pillar |
| `frontend/e2e/skeleton.spec.ts`                                 | edit   | becomes the first feature's smoke walk, renamed (say `smoke.spec.ts`); the offline step's spec follows it (below) |
| `frontend/src/app/(app)/layout.tsx`                             | edit   | the project's app frame |
| `frontend/src/app/(app)/messages/_components/messages-list.tsx` | delete | the demo's list |
| `frontend/src/app/(app)/messages/page.tsx`                      | delete | the demo's app page |
| `frontend/src/app/(marketing)/contact/page.tsx`                 | delete | the demo's public page |
| `frontend/src/app/(marketing)/layout.tsx`                       | edit   | the project's public frame |
| `frontend/src/app/(marketing)/page.tsx`                         | edit   | the project's home page, from its spec |
| `frontend/src/app/fonts.ts`                                     | keep   | the font step 4 chose; step 4 kept the marker, which goes now |
| `frontend/src/app/not-found.tsx`                                | edit   | the project's own words (`design/copy.md`) |
| `frontend/src/features/contact/contact-form.stories.tsx`        | delete | the demo form's story |
| `frontend/src/features/contact/contact-form.test.tsx`           | delete | the demo form's test |
| `frontend/src/features/contact/contact-form.tsx`                | delete | the demo form |
| `frontend/src/features/contact/index.ts`                        | delete | the demo feature's entry |
| `frontend/src/lib/data/messages.test.tsx`                       | delete | the demo hooks' tests |
| `frontend/src/lib/data/messages.ts`                             | delete | the demo hooks |
| `frontend/tests/bundled-fonts.test.ts`                          | keep   | a rule test: fonts ship with the app |
| `.github/workflows/deploy-dev.yml`                              | keep   | the skip while `deploy/accounts.json` is empty |
| `.github/workflows/deploy-production.yml`                       | keep   | the same skip |
| `deploy/functions/web-server/start.mjs`                         | keep   | the site Lambda's entry |
| `deploy/scripts/package.ts`                                     | keep   | packages each Lambda |
| `deploy/scripts/smoke.ts`                                       | edit   | the demo's checks (the messages API, the contact page) become the first feature's |
| `deploy/scripts/sst.ts`                                         | keep   | the diff and deploy commands |
| `deploy/scripts/stage-resources.ts`                             | keep   | what `sst shell` hands a script |
| `deploy/src/bundles.ts`                                         | keep   | each Lambda's folder |
| `deploy/src/cdn.ts`                                             | keep   | the distribution's settings |
| `deploy/src/diff-guard.ts`                                      | keep   | the data-loss guard |
| `deploy/src/edge.ts`                                            | keep   | the viewer-request function |
| `deploy/src/email.ts`                                           | keep   | a stage's email; remove it with `mailer` if no feature sends mail |
| `deploy/src/environment.ts`                                     | edit   | `ownerEmail` goes; the table keeps its name until the first feature's data replaces it |
| `deploy/src/permissions.ts`                                     | keep   | least privilege for the API |
| `deploy/src/sst-script.test.ts`                                 | keep   | the empty-accounts stop |
| `deploy/src/stage.ts`                                           | keep   | the stages and accounts |
| `deploy/src/web.ts`                                             | keep   | the site from OpenNext's output |
| `deploy/sst.config.ts`                                          | edit   | the demo's `OwnerEmail` goes; the table and the API stay for the first feature |

Also, where the skeleton is named rather than marked:

- **The offline step's spec:** `tools/local-check/src/offline.ts` runs
  `skeleton.spec.ts` by default; point it at the renamed spec, with its test
  (`tools/local-check/src/offline.test.ts`) and the mentions in the root
  `CLAUDE.md` (_Local first_), `frontend/CLAUDE.md` and
  `tools/local-check/CLAUDE.md`.
- **The demo's mentions:** `git grep -n -i "demo\|contact message\|skeleton"`
  outside `docs/decisions/` and the bootstrap's own files, and reword what
  still describes the demo (the runbook's _What a stage holds_,
  `deploy/CLAUDE.md`'s _What it deploys_, `infra/aws/README.md`'s region table
  row for SES, `frontend/CLAUDE.md`'s opening).
- **The meters:** `usage.ts` keeps a meter for every paid service the first
  feature uses, asserted in its contract suite (root `CLAUDE.md`, the cost
  rule).

Then `pnpm fix`, `pnpm check --concurrency=2` and `pnpm e2e`; mark the step
done (`pnpm bootstrap:state done replace-skeleton`) and commit, since
`pnpm check:full` refuses a dirty worktree; then `pnpm check:full`, fixing
in a further commit what it finds. A rule test that fails (the backend's structure test, the
lint boundaries, knip) is telling you what the first feature still lacks:
fix the feature, never the rule. A rule test's own demo entries are marked
and listed above (`structure.test.ts`, `lint-rules.test.ts`): those name the
first feature's files instead, and nothing else in the test changes.

## Records

- BS rows: which feature replaced the skeleton; whether the mail pieces went
  or stayed; any rule test changed, with why (none is the expected answer).

## Done when

- `git grep -F "Skeleton:"` finds the marker only in the template-build log
  (`docs/decisions/2026-10-21-template-build-decisions.md`) and
  the bootstrap's own files.
- No demo route, page, store or meter is left (the grep above finds no demo
  text that is not history).
- The first feature's spec rows have tests, and `pnpm check:full` passes.
