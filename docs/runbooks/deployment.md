# Deployment: how a stage is deployed, and how to change it

The app's AWS resources, per stage, are SST code in `deploy/`
(`deploy/CLAUDE.md`). The platform underneath (accounts, sign-in, the region
guardrail): [`infra/aws/README.md`](../../infra/aws/README.md). The decisions
behind the deployment:
[`2026-10-01-sst-dev-deployment-decisions.md`](../decisions/2026-10-01-sst-dev-deployment-decisions.md).

`<project>` is the project's name, `<region>` its AWS region and
`<dev-account-id>` the dev account's ID; all three are bootstrap answers,
written in `deploy/accounts.json` (`region`, `domain`, and each stage's
`account`). A project deploys nothing until the accounts step of `/bootstrap`
has run: with the file empty, `pnpm sst:diff` and `pnpm sst:deploy` stop at
once with a one-line message naming `/bootstrap accounts`, and the deploy
workflows skip themselves. Even with the accounts filled, `pnpm sst:deploy`
and the deploy workflows refuse until `/bootstrap` step 6 (replace the
skeleton) is done, because the demo app has no sign-in
([`deploy/CLAUDE.md`](../../deploy/CLAUDE.md), the bootstrap guard);
`sst:diff` still runs.

## What a stage holds

The skeleton's resources (`deploy/CLAUDE.md`, *What it deploys*): `Api` (the
API Lambda), `Data` (its DynamoDB table), the site (`WebServer`,
`WebAssets`), `Cdn` (CloudFront), and, on a stage with a domain, SES. Three
secrets per stage, set once, never printed:

| Secret              | Holds                                                   | Needed                          |
| ------------------- | ------------------------------------------------------- | ------------------------------- |
| `OriginSecret`      | proves a request came through CloudFront                | every stage                     |
| `BasicAuthPassword` | the password in front of every stage but production     | every stage but production      |
| `OwnerEmail`        | where the demo's contact messages are mailed (TB30)     | optional; empty, none are mailed |

```bash
openssl rand -hex 32 | tr -d '\n' | pnpm exec sst secret set OriginSecret --fallback
openssl rand -hex 24 | tr -d '\n' | pnpm exec sst secret set BasicAuthPassword --fallback
printf %s 'owner@example.com' | pnpm exec sst secret set OwnerEmail --fallback
```

`--fallback` sets the value for every stage that has none of its own. Never
run `sst secret list` bare: it prints every value.

## Before you start

```bash
aws sso login                 # the default profile is dev
aws sts get-caller-identity   # <dev-account-id>
cd deploy
pnpm install                  # once; typegen runs `sst install`
```

## Deploy a stage

`dev` is deployed from the Mac after merges (*The deploy pipeline*, below); before
deploying it by hand, read that section's checks.

```bash
pnpm sst:diff --stage <s> 2>&1 | tee /tmp/sst-diff.txt   # checks accounts.json, builds the backend and the site, then plans
pnpm diff-guard --stage <s> /tmp/sst-diff.txt            # refuses a delete or replace of what holds data
pnpm sst:deploy --stage <s>   # about 5 minutes; a new stage about 8
pnpm smoke --stage <s>        # must end "Smoke test passed."
```

- **Read the diff.** `pnpm diff-guard` checks the stop list below, and the
  pipeline runs it; it does not read the rest for you. `+` creates, `*` updates, `-` deletes, and a replace
  shows as a delete plus a create. A delete or replace of `Data` (or of
  anything else that holds users' data, once a project adds it to the diff
  guard) loses data: stop. On a stage's first deploy the diff cannot show
  what depends on values that do not exist yet (the build, the site's routes,
  bucket policies, functions); a second diff shows them. Every diff of an
  existing stage lists `WebServerFunction` and `WebServerCode` as deleted and
  `WebBuild`, `WebUpload`, `WebInvalidation` as created: the site is rebuilt
  on every deploy, so the diff cannot see the server function that waits on
  the upload. The deploy updates it in place.
- **`pnpm sst:diff` and `pnpm sst:deploy` also lay out `deploy/.build/`**
  (`scripts/package.ts`): each Lambda's own folder.
- **The deploy builds the site** (`pnpm run build:opennext` in `frontend/`)
  with the stage's `SITE_URL`, uploads it, and invalidates CloudFront's cache
  (`/*`), so pages and public files are fresh within a minute or two.
- **The smoke test** checks basic auth (401 without, 401 wrong), `/api/health`,
  that the messages list answers from the table, that an empty send is
  refused (it sends no message), the contact and messages pages, the
  security headers, that an encoded `..` in an API path is refused at the
  edge, a hashed file from the bucket, and that each API Gateway default
  address (API and site) answers `403` without the origin secret or with a
  wrong one, and `200` with it. It reads the stage's credentials through
  `sst shell` and prints statuses only.
- **A `403` on the stage's CloudFront address** means CloudFront is not
  sending the origin secret the API and the site expect: both read it at
  deploy time, so after `sst secret set OriginSecret` deploy again.
- **Never `sst dev` on `dev`:** it replaces the deployed functions with a
  bridge to your laptop.

## The deploy pipeline

**Dev, from the Mac after merges** (CI decisions CI17). A push to `main` runs
nothing on GitHub. After merging, the orchestrator deploys `dev` from a clean
checkout of the new `main`, on Node 24, signed in to `<project>-dev`
(`aws sts get-caller-identity` first), when the merges changed something
deployed (the deploy, backend, frontend, contracts or design packages):

```bash
git fetch origin && git switch --detach origin/main     # in a clean worktree
pnpm install --frozen-lockfile
cd deploy
pnpm sst:diff --stage dev 2>&1 | tee /tmp/sst-diff.txt   # read it
pnpm diff-guard --stage dev /tmp/sst-diff.txt            # stops on a data loss
pnpm sst:deploy --stage dev
pnpm smoke --stage dev                                   # must end "Smoke test passed."
```

Several merges in a row need one deploy, of the last. Say in the merged
PRs' beads, or the orchestrator's log, which commit `dev` runs.

**The fallback: `deploy-dev.yml`.** When the Mac cannot deploy (no AWS
session, the laptop away), start the workflow on `main` (Actions, deploy-dev,
Run workflow; or `gh workflow run deploy-dev.yml --ref main`). It runs
`.github/actions/deploy-stage` for `dev`, the same four steps, as the role
`github-deploy-dev` through GitHub's OIDC token (no stored keys; the role:
`infra/aws/README.md`, *GitHub deploy role*). The run's summary shows each
step's outcome; its first step prints the token's subject, which is what the
role's trust is checked against. About 5 billed minutes a run.

**One deploy at a time.**

- GitHub runs one `deploy-dev` job at a time (concurrency `deploy-dev`, never
  cancelled).
- SST's lock refuses a second deploy of the same stage ("Locked"), so a Mac
  deploy and a `deploy-dev.yml` run never overlap; before either, check that
  no `deploy-dev.yml` run is in progress
  (`gh run list --workflow deploy-dev.yml --limit 3`).
- **Deploying a branch to `dev`** (agents, A9: a branch that needs sign-in or
  the real AWS before it merges): diff, guard, deploy and smoke as in
  *Deploy a stage*, and say in your bead that `dev` runs your branch. The
  next deploy of `main` puts it back. Never `sst unlock` a lock you did not
  leave while any deploy may be running.

**When the diff guard refuses.** Nothing was deployed. The job's log names
the line: anything but an update of `Data` (or its table), including a create of one on
`dev` or production, which means SST lost the old one. That is data lost:
find the change that caused it (usually a renamed component: *Change
something*), fix it on `main`, then deploy. If the loss is
intended, it is the owner's decision, never a deploy by hand around the
guard. Behind the guard, the same resources carry Pulumi's `protect` on
`dev` and production (`sst.config.ts`, `keepData`): a delete or replace
fails the deploy even if the guard missed it; a deliberate one starts with
a PR that removes it.

**Roll back.**

- **Code:** revert the PR on `main` (the merged PR's Revert button, or a
  `git revert` of its squash commit, through a PR, with its proof), then
  deploy the new `main` as above. Faster while the revert is reviewed:
  deploy the last good commit from the Mac, from a clean worktree at that
  commit (`git switch --detach <good sha>`), through the same diff, guard
  and smoke test; the next deploy of `main` replaces it.

- **Data:** the table has point-in-time recovery for 30 days, restored into
  a new table (`aws dynamodb restore-table-to-point-in-time`), then taken
  under SST by import (*Retained resources*). Rare, by hand, and the owner hears of it.

**Clear a stuck deploy.**

- **Queued, not starting:** a `deploy-dev.yml` run waits for the running
  one. Let it; GitHub keeps only the newest waiting run.
- **Running too long:** GitHub stops the job at 30 minutes. A deploy killed
  midway (on GitHub or the Mac), or a run cancelled by hand, leaves SST's
  lock. Make sure nothing else is deploying (above), then
  `pnpm exec sst unlock --stage dev` and deploy again. Never unlock while
  another deploy runs. Pending operations after a kill: *When a deploy
  fails*.
- **"Not authorized to perform sts:AssumeRoleWithWebIdentity"** (the
  fallback workflow): the token's subject (the run's first step) is not one
  the role trusts, or the role or provider is gone: compare with
  `infra/aws/README.md`. A run started on another branch than `main` is
  skipped.
- **AccessDenied during the fallback's deploy:** the role lacks a permission
  a change needs (a new kind of resource). Add it to
  `infra/aws/github-deploy.yaml`, apply it (`infra/aws/README.md`), run it
  again. A deploy from the Mac runs as your own SSO role instead.
- **A failed deploy stays failed** until someone deploys again: nothing
  retries it. Fix the cause on `main` (through a PR) and deploy from the Mac.

**Production** (CI decisions CI19). `.github/workflows/deploy-production.yml`
releases one commit the owner names, as `github-deploy-production` in
`<project>-prod`. Only the owner starts it, on `main`; anyone else's run is
skipped, and agents never start it. Before production's first release, the
owner's launch checklist must be done.

1. **Plan.** Actions, deploy-production, Run workflow, branch `main`: `sha`
   the commit to release (main's head, or an older commit to roll back to;
   at least 7 characters), apply off. Or
   `gh workflow run deploy-production.yml --ref main -f sha=<sha>`. The run
   is named `Plan <sha> to production`. Its release check refuses a commit
   that is not on main's history or has no passed `pnpm check:full` (on the
   commit, or on the head of the pull request that made the squash commit,
   with the same tree); then the release itself is checked out and planned.
   Read the summary: the release, its proof, the diff guard's verdict and
   the `sst diff`.
2. **Release.** Run it again with the same `sha` and apply on
   (`-f apply=true`): `Release <sha> to production`. It is refused unless a
   passed plan of that commit is newer than every release run since; then
   the same diff and guard, `sst deploy` and `pnpm smoke --stage production`.
   On production's very first deploy, also `first_deploy` (the guard then
   accepts creating its table).

- **"has no passed pnpm check:full"**: the commit's pull request merged when
  main had moved, so the squash commit's tree is not the proven head's. In a
  clean worktree at that commit (`git switch --detach <sha>`), on Node 24,
  run `pnpm check:full` (it measures a commit already on main from its first
  parent): it posts the proof on the commit. Then plan again.
- **"no passed plan of ..."**: plan first (with the same `first_deploy`), or
  plan again after a release ran.
- **"a release is never re-run"**: a release that failed is not re-run from
  GitHub's Re-run button; plan the commit again, read it, release.
- **Roll back** production: plan, then release, the last good commit. The
  next release of a newer commit replaces it. Data: as for `dev` above.
- **A stuck or failed release**: as for `dev` above, with `--stage production`
  and the `<project>-prod` profile, which only the orchestrator with the
  owner's go-ahead uses.

## Change something

| You want to                       | Change                                                          |
| --------------------------------- | --------------------------------------------------------------- |
| Fill in the accounts, the region  | `deploy/accounts.json` (`/bootstrap accounts`), then diff, deploy |
| Point a stage at a domain         | `domain` in `deploy/accounts.json`: production at it, dev at `dev.<domain>` |
| Memory, timeouts                  | `deploy/sst.config.ts`                                          |
| What differs by stage             | `deploy/src/stage.ts` and its test                              |
| Code CloudFront runs              | `deploy/src/edge.ts` and its test (10 KB limit with SST's code) |
| What the API may do               | `deploy/src/permissions.ts`, `deploy/src/email.ts` and their tests |
| Where the demo's mail goes        | the `OwnerEmail` secret, then deploy                            |
| OpenNext's behaviour              | `frontend/open-next.config.ts`                                  |

**Renaming an SST component replaces its resource.** On a throwaway stage
that deletes the data of `Data`; on `dev` and `production`
(`removal: retain`) the old one stays in AWS, unmanaged, and the new one
starts empty. `sst diff` shows it as `-` on the old child and `+` on the new
one: stop there (`pnpm diff-guard` refuses it, and on `dev` and `production`
Pulumi's `protect` fails the deploy). Best is to keep the name. If a rename is
unavoidable, give the resource underneath a Pulumi alias to its old name:

```ts
new sst.aws.Dynamo("DataRenamed", {
  // ...the same arguments...
  transform: { table: (_args, opts) => { opts.aliases = [{ name: "DataTable" }] } },
});
```

The alias names the old child (`<OldName>Table`, `<OldName>Bucket`; the
URNs in `pnpm exec sst state export --stage <s>` show it). The diff then
lists only the SST component, not the table or bucket, and the deploy keeps
the same physical resource and its data. Remove the alias after that
deploy; the next diff is empty. This was proven on a table. A bucket's
CORS, public-access block and policy are children of their own: read the
diff for a replace of any of them, and alias each one that shows.

### Retained resources

`removal: retain` (dev, production) or a `retainOnDelete` option keeps a
bucket or table in AWS when its component leaves the code. **Nothing on
screen says so:** neither the diff nor the deploy shows the option, and
both print "Deleted" when the resource is dropped. The resource then exists
unmanaged, with its data and its `sst:stage` and `<project>:stage` tags, so
the tagging API finds it. A `transform`
that sets `opts.retainOnDelete` marks only that one child. The bucket's
CORS, public-access block and policy are still deleted. SST may pass a
component-level `{ retainOnDelete: true }` on to every child, but that was
not tried: check `pnpm exec sst state export` before relying on it.

To take a retained table back under SST, import it, then remove the two
lines after the deploy:

```ts
transform: { table: (args, opts) => { args.name = "<table name>"; opts.import = "<table name>"; } },
```

The diff shows it as `+`; only the deploy's progress line says
"Imported". To delete a retained resource instead, delete it by hand
(`aws s3 rb s3://<bucket> --force`, `aws dynamodb delete-table`) and check
the tagging API again (*Tear down a throwaway stage*).

### Production guard

- SST's own `protect` (on `dev` and `production`, `deploy/src/stage.ts`)
  refuses `sst remove` with "Cannot remove protected stage". SST reads it
  from `sst.config.ts` as it evaluates the config, not from the deployed
  state, so it holds even before a deploy.
- `removal: retain` on both. On every stateful component, `dev`'s state
  shows `retainOnDelete`.
- The table has deletion protection.
- Throwaway stages have none of these, so a remove takes everything.

### Stages

One stage per environment: `dev` and throwaway stages in `<project>-dev`,
`production` in `<project>-prod` (A decisions). Throwaway stages: *Tear
down a throwaway stage* below. To find stale ones:

```bash
pnpm exec sst state list                                  # stages that still hold resources
aws resourcegroupstaggingapi get-tag-values --key <project>:stage --region <region>
```

A stage listed but not in use: *Tear down a throwaway stage*.
`get-tag-values` also lists stages whose only entries are the tagging API's
stale ones (below).

## Tear down a throwaway stage

A bead that needs its own stage names it after the bead (letters, digits,
dashes, starting with a letter) and removes it when the bead closes.

```bash
pnpm exec sst remove --stage <name>   # dev and production are protected: SST refuses them
aws resourcegroupstaggingapi get-resources --region <region> \
  --tag-filters Key=<project>:stage,Values=<name> --query 'ResourceTagMappingList[].ResourceARN'
```

The tagging API sees most of a stage's resources in `<region>`; CloudFront's
own API (`aws cloudfront list-distributions`) shows its distribution (the
tagging API would need `us-east-1`, which the region SCP denies). The tagging
API goes on listing a deleted Lambda event source mapping or network
interface for a while: check the service itself before treating one as left
over.

`sst remove` keeps two records of a removed stage: its passphrase
parameter and an empty state file (the stage's history). They hold no AWS
resource and cost nothing. A clean removal ends with:

```
$ pnpm exec sst remove --stage dev
Cannot remove protected stage

$ pnpm exec sst remove --stage <name>
✓  Removed
```

## When a deploy fails

- **`PreconditionFailed` (412) on a CloudFront function**, or any resource
  changed outside SST: `pnpm exec sst refresh --stage <s>` reads the real
  state back, then deploy again. **`sst diff` does not see a change made
  outside SST until a refresh.** After `sst refresh`, which prints
  "Updated" for each drifted resource without detail, the diff shows the
  values the deploy will put back.
- **Interrupted deploy:** run it again. Stopped with Ctrl-C, SST cancels
  cleanly and releases its lock. The old site keeps serving meanwhile.
  Killed outright, it leaves the lock (`lock/<project>/<stage>.json` in the
  state bucket), and the next run says "Locked … Run `sst unlock`". Then
  run `pnpm exec sst unlock --stage <s>` and deploy.
- **Pending operations after a hard kill.** A resource being created when
  the process died stays in the state as a pending operation. SST shows
  nothing about it; only `deploy/.sst/log/pulumi.log` warns. Unlock,
  deploy, `sst refresh` and `sst state repair` do not clear it.
  1. Check in AWS whether the resource was created. If it was, import it
     (*Retained resources* above).
  2. Remove it from `pending_operations` with
     `pnpm exec sst state edit --stage <s>`, which opens the state in
     `$EDITOR`.
- **`sst remove` printing "✕ Failed"** after every resource is deleted: two
  providers can exit early while the root stack is deleted. A second
  `pnpm exec sst remove` says "No resources to remove" and the tagging API
  decides.
- **502 `FunctionValidationError` from CloudFront** on every request: a header
  the viewer-request function sets is invalid, usually a secret with a
  newline. Reset the secret and deploy.
