# deploy/

The SST app: every stage's AWS resources, in `acme-dev` (dev and
throwaway stages) and, later, `acme-prod`. **The accounts, the region and the
domain are one file, `accounts.json`,** empty until `/bootstrap accounts`
fills it; with it empty every deploy command stops with a message saying so
and the GitHub deploy workflows skip themselves. **Until bootstrap step 6
replaces the skeleton, nothing deploys:** its demo routes are unauthenticated,
so `pnpm sst:deploy` and the deploy workflows' first step refuse while
`.bootstrap/state.json` says step 6 is not done (`src/bootstrap-guard.ts`;
the template ships the file and the bootstrap keeps it, so only a project
that deleted `.bootstrap/` has none, which counts as done). `sst:diff` still runs. Why it is built this way:
`docs/decisions/2026-10-01-sst-dev-deployment-decisions.md`. How to
deploy, smoke test and tear down: `docs/runbooks/deployment.md`. Platform
rules (accounts, the SCP, who may do what): `infra/CLAUDE.md`.

## The loop

```bash
pnpm fix      # eslint --fix, then prettier --write
pnpm check    # format, lint, types (after `sst install`), knip, unit tests
```

`typegen` runs `sst install`, which downloads SST's platform code into
`.sst/` (git-ignored, about 470 MB) so `sst.config.ts` can be typed. The
first run takes a minute.
`pnpm fix` runs `typegen` first, on purpose: without `.sst/` the config has
no types, so ESLint sees no deprecation, calls a deprecation's
`eslint-disable` unused and `--fix` deletes it. Afterwards it is a few
seconds.

## What it deploys

The skeleton's resources, and nothing else (`sst.config.ts`):

- **`Api`**: the API Lambda (`backend/src/entries/lambda/api.ts`) behind an
  API Gateway HTTP API, routed at `/api`.
- **`Data`**: the DynamoDB table the messages live in (keys from the
  backend's own table definition).
- **The site**: OpenNext's build of `frontend/`, its static files in the
  `WebAssets` bucket, its server in the `WebServer` Lambda behind its own
  HTTP API.
- **`Cdn`**: one CloudFront distribution in front of both, running basic auth
  (every stage but production) and the origin secret in its viewer-request
  function.
- **Email**, only on a stage with a domain: an SES identity for the domain,
  two configuration sets and their DNS records.

A project adds its resources here, each with a sibling test in `src/` and a
row in the table below.

## Where things go

| You are changing                                                | It goes in                                                                                                                                                                                                            |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The accounts, the region, the domain                            | `accounts.json` (`/bootstrap accounts`); read by `requireAccount` in `src/stage.ts`, which throws `NoAccountsError` while they are empty                                                                              |
| Anything that differs by stage                                  | `src/stage.ts` (`stageSettings`): the only place a stage name is compared                                                                                                                                             |
| A stage's domain                                                | `domain` in `accounts.json`: production at the domain, dev at `dev.<domain>`, a throwaway stage at none (`stageSettings`)                                                                                             |
| Code CloudFront runs on every request                           | `src/edge.ts` (basic auth, origin secret, viewer address, cache key, the `/api` path rule); the whole function, SST's router included, is compacted on deploy and must fit `src/edge-function.test.ts`'s budget (S20) |
| What the API may do in AWS                                      | `src/permissions.ts` (item actions on its table) and `src/email.ts` (SES)                                                                                                                                             |
| Which files a Lambda ships                                      | `src/bundles.ts` (one folder per function under `.build/`, laid out by `scripts/package.ts`)                                                                                                                          |
| The site Lambda's entry (wakes the API, then OpenNext's)        | `functions/web-server/start.mjs`, installed by `installServerStart` in `src/web.ts`                                                                                                                                   |
| The security headers on every answer                            | `securityHeaders` in `src/cdn.ts` (decision S22); a CSP is a later addition                                                                                                                                           |
| A stage's email (SES identity, DNS records, configuration sets) | `src/email.ts`, switched on by `email` in `src/stage.ts` (a stage with a domain)                                                                                                                                      |
| The API's environment                                           | `src/environment.ts`, checked against the backend's own `loadConfig`                                                                                                                                                  |
| Where the demo's messages are mailed                            | the `OwnerEmail` SST secret (TB30); `ownerEmail` in `src/environment.ts`                                                                                                                                              |
| How the site's build is uploaded and routed                     | `src/web.ts`                                                                                                                                                                                                          |
| What the deploy pipeline refuses in a diff                      | `src/diff-guard.ts` (`pnpm diff-guard`); the pipeline's steps: `.github/actions/deploy-stage`                                                                                                                         |
| Which AWS profile a deploy uses (none in CI)                    | `awsProfile` in `src/stage.ts`                                                                                                                                                                                        |
| Checking a deployed stage                                       | `scripts/smoke.ts` (`pnpm smoke --stage <s>`)                                                                                                                                                                         |
| Wiring the pieces together                                      | `sst.config.ts`: no logic of its own                                                                                                                                                                                  |

`deploy` reads the backend's table definition and config and the
frontend's `package.json` by path; they are listed as devDependencies (and
in knip's `ignoreDependencies`) only so turbo re-runs these checks when
they change.

Every `src/` module has a sibling test; `sst.config.ts` has none, so keep
decisions out of it.

## Rules

- **`dev` is deployed from the Mac after merges** (CI17; `deploy-dev.yml` is the
  manual fallback on GitHub). Before deploying it, follow the runbook's
  "The deploy pipeline" (the checks, rollback, a stuck deploy).
- **Production is released by the owner's workflow only**
  (`.github/workflows/deploy-production.yml`, CI decisions CI19): a proven
  commit on main, plan, then release. What it needs before its first
  release is the owner's launch checklist.
- **Read `sst diff` before every deploy** (`pnpm sst:diff --stage <s>`,
  then `pnpm diff-guard --stage <s> <saved diff>`). A
  first deploy cannot show what depends on values that do not exist yet.
  Stop on a delete or replace of `Data`, and of anything that holds users'
  data a project adds (add it to `PROTECTED` in `src/diff-guard.ts`).
- **Renaming a component replaces it.** On a throwaway stage a bucket's or
  the table's data is gone; on dev and production (`removal: retain`) the old
  one is left behind, unmanaged, and the new one starts empty. `sst diff`
  shows it as a delete plus a create; stop there. If a rename is
  unavoidable, use a Pulumi alias (runbook, "Change something").
- **Never remove `dev` or `production`.** Both are `protect`ed, so
  `sst remove` refuses them. A throwaway stage is named after its bead and
  removed when the bead closes (`pnpm exec sst remove --stage <name>`).
- **Never `sst dev` on a shared stage**: it replaces the deployed functions
  with a bridge to your laptop.
- **Secrets never show.** Set them from a generator or a file through stdin
  (`openssl rand -hex 32 | tr -d '\n' | pnpm exec sst secret set Name --fallback`).
  Strip the newline: SST stores it, and a secret ending in one breaks the
  header CloudFront sends (every request then fails with 502).
  `sst secret list` prints every value: never run it bare; pipe it through
  `awk -F= '/=/{print $1, length($2)}'` to see names and lengths.
- **Nothing billed while idle** (root `CLAUDE.md`). No provisioned
  concurrency, warmers, NAT, containers, or queue consumers without a worker.
- **Lambda function URLs do not exist in every region.** Anything HTTP sits
  behind an API Gateway HTTP API, and the site is wired by hand
  (`src/web.ts`) because SST's `Nextjs` component needs function URLs.
- Pins: `sst` exactly (4.17.1); OpenNext through the frontend's lockfile
  (`@opennextjs/aws` 4.1.x, D4). Upgrading either is its own change, with a
  throwaway-stage deploy.
