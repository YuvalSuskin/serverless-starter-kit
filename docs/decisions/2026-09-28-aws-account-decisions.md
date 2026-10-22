# AWS accounts and access — decisions

**Decided:** 2026-09-28 to 2026-09-30, Yuval Suskin
**What exists now:** [`infra/aws/README.md`](../../infra/aws/README.md)

How the project's AWS accounts are laid out, how people get in, what keeps
data in the chosen region, and what agents may do in the accounts without
asking (A9). The app's own resources (SST, deployment) are not decided here;
the SST dev deployment decisions
([`2026-10-01-sst-dev-deployment-decisions.md`](2026-10-01-sst-dev-deployment-decisions.md))
build on this.

`<region>` is the one AWS region the project's data lives in, and `<project>`
its name; both are bootstrap answers (`/bootstrap`). Nothing here needs an AWS
account to exist before the first deploy.

## Decided

| #   | Decision                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------- |
| A1  | IAM Identity Center, organization instance, home region `<region>`                                                      |
| A2  | Three accounts: management (no workloads), `<project>-dev`, `<project>-prod`                                            |
| A3  | A region SCP on the Workloads OU: nothing regional outside `<region>` in dev and prod                                   |
| A4  | One Identity Center user per person; admin in every account; prod sessions 3 hours, others 12                           |
| A5  | CLI: one SSO login, dev is the default profile                                                                          |
| A6  | `infra/` holds the platform layer; one-time setup scripts are reviewed, run and not committed                           |
| A7  | Centralized root access management: no root sign-in or password recovery in dev and prod                                |
| A8  | DNS on Route 53, a zone per account; production at the apex domain, dev at `dev.<domain>`                               |
| A9  | Agents work in dev without asking, secrets included; pay per use, nothing billed while idle; production only on request |

### A1 — Identity Center in the project's region

Sign-in for people is IAM Identity Center (AWS SSO), using its own directory.
No IAM users, no long-lived access keys.

**Home region `<region>`**, the region the data lives in. Identity Center
stores users, groups and assignments in its home region, and the owner's rule
is that data stays in the chosen region. Its emails go through Amazon SES in
the same region where AWS offers it there. **Cost:** an opt-in region must be
enabled in every account of the Organization before Identity Center can reach
it.

**Organization instance, not an account instance.** Only an organization
instance can give access to AWS accounts (permission sets), which the CLI
needs. Enabling it creates the AWS Organization with the original account as
its management account.

### A2 — Separate accounts for dev and prod

The management account controls billing, the Organization and sign-in, and
SCPs never apply to it. Keeping the app out of it means a mistake or leaked
credentials in the app's account cannot reach billing or identity, and the
guardrail in A3 can apply to everything the app runs on.

Dev and prod are separate accounts rather than stages side by side in one:
credentials for one cannot touch the other, removing or breaking dev cannot
affect prod, and the bill splits by account with no tagging.

**Why at the start:** the accounts are empty. Moving later means copying
tables and buckets, and a Cognito user pool cannot be moved at all; users
would sign in again or reset.

**Rejected:** AWS Control Tower and a full landing zone (log archive and audit
accounts, extra services): more than a small team needs. A separate backup
account stays an option.

Each account has its own root user, identified by an email that is unique
across AWS, so members use plus-addresses (`me+dev@`, `me+prod@`) that reach
the same inbox. The Organization allows 5 accounts (3 used); closed accounts
keep counting.

### A3 — The region SCP

A service control policy on the Workloads OU denies every action outside
`<region>`, except global services (IAM, STS, CloudFront, Route 53, ACM, WAF,
billing and the rest of AWS's published exemption list, plus CloudFront
KeyValueStore for SST's routing). It also denies enabling or disabling
regions from inside dev or prod. The policy file lives in `infra/aws/`, from
AWS's region-control examples.

It turns "data stays in the region" from a convention into something AWS
enforces. **Side effects accepted:** no Lambda@Edge; no CloudWatch billing
alarms (Budgets instead); billing changes only from management.

**Not covered, and not coverable by an SCP:** CloudFront caches content at
edge locations worldwide, so content served through CloudFront is cached
outside the region. Whether that fits the rule is part of the CDN plan.

The exemptions for `kms`, `acm`, `config` and `wafv2` let those services act
in any region; they hold keys, certificates and configuration, not user data.
Narrow them if a stricter reading of the rule is ever needed.

**Amendments.** A narrow exemption is added only for a service that can work
nowhere else: CloudFront standard logs (v2) are delivered through the
CloudWatch Logs delivery API in `us-east-1`, and a Cognito custom domain takes
its certificate only from `us-east-1`. Each exemption names its actions and
the region they are allowed in, and the data it lets out of the region is
only configuration, never user data.

### A4 — One user per person, admin everywhere, shorter prod sessions

One Identity Center user per person, with `AdministratorAccess` (12-hour
sessions) on management and dev, and `AdministratorAccessProd` (the same
policy, 3-hour sessions) on prod: long enough to debug, shorter than a working
day.

**Prod access.** An SSO login is one token for the user, and that token can
fetch credentials for every account the user is assigned to. So separate CLI
logins per account keep tokens apart but do not stop anything on the machine
from reaching prod, and "dev is the default" (A5) guards against accidents,
not intent. A real wall would be a second user for prod and management, with
its own password and MFA. **Considered and deferred:** too much friction for
now. Revisit when prod holds real data or when a second person joins. The
longer-term plan is that only CI deploys to prod.

Guarding Claude Code sessions against prod (hooks or permission rules in
`.claude/settings.json`) was considered and left for later. `infra/CLAUDE.md`
states the rule for agents.

A newcomer gets their own Identity Center user with access to dev only, until
there is a reason for more.

### A5 — CLI profiles

One `sso-session` and one `aws sso login` for all accounts. Profiles
`<project>-dev`, `<project>-prod` and `<project>-management`, and the
`default` profile points at dev, so anything that names no profile, including
SDKs and tools that read the default, lands in dev.

### A6 — Where the platform setup lives

`infra/` describes the platform layer (accounts, identity, guardrails, later
DNS and Cloudflare): what exists, the IDs, and how to change it. Why lives
here in `docs/decisions/`. App resources are SST code, not `infra/`.

The account setup runs as a one-time script, reviewed by a separate reviewer
before the owner runs it. It is not committed: `infra/aws/README.md` records
its result, and the SCP file it applied is committed as the policy's source of
truth.

### A7 — No root sign-in in dev and prod

Each member account has a root user that bypasses Identity Center. Accounts
created without root passwords can still be taken over by anyone who can read
the `+dev` or `+prod` inbox: they recover the password and sign in as root,
with no MFA, since none was set. So the inbox alone is enough to take over
prod.

Centralized root access management (`RootCredentialsManagement` and
`RootSessions`) blocks root sign-in and password recovery in the members; the
only way in is SSO, which needs the owner's passkey. The management account's
own root is unchanged and has MFA.

**Cost accepted:** the rare root-only task in a member (its Support plan, S3
MFA delete) needs a round trip: allow password recovery from the management
account, reset, do the task, delete the credentials again. Locked-out bucket
and queue policies are fixed from the management account directly.
**Reversible:** switching the features off restores the old behaviour. Three
commands, reversible and free, so done at the start.

### A8 — Where DNS lives, and each stage's address

DNS moves from the registrar to Route 53, in two hosted zones: the apex domain
in `<project>-prod` and `dev.<domain>` in `<project>-dev`, delegated from the
first, so dev deploys can never touch production's records or mail. The
registration stays at the registrar; only the nameservers change, after every
record (mail first) is copied and compared. Production is the apex domain
(`www` redirects to it), dev is `dev.<domain>`, other stages
`<stage>.dev.<domain>`; the API and media stay under `/api/` and `/media/`.
Sign-in runs on `auth.<domain>` and `auth.dev.<domain>`. Dev gets basic auth in
front of it, which does not block the first deployment.

### A9 — What agents may do without asking

**Dev: full autonomy.** Agents deploy, update and remove the app in
`<project>-dev` without asking: any kind of resource billed only by use, their
own stages, test data, and they remove what they no longer need. Still the
owner's: the platform itself (accounts, Identity Center, organization
policies, the region SCP), anything outside `<region>`, and anything in prod
or management.

**Pay per use.** The project is built on serverless services billed only by
use, choosing the cheapest pay-as-you-go option, so an idle system costs
close to nothing: stored bytes and small fixed items (a hosted zone, a key)
are the accepted exceptions. A resource billed by the hour while unused (a NAT
gateway, a database or cache instance, provisioned concurrency, a running
container, a flat-rate plan) breaks this and goes to the owner as a
review-batch item, with the pay-per-use options it was compared to. It holds
in every account, and follows the per-unit cost rule in the root `CLAUDE.md`.

**Technical choices: the agent's.** They decide, log the choice in the
feature's decisions doc, and continue. Only a change a user would notice, or
going against a recorded decision or promise (a new company receiving user
data breaks the privacy promises, for example), becomes a review-batch item.
This writes down the rule in `docs/superpowers/specs/CLAUDE.md`.

**Secrets: agents handle them in dev, without ever showing a value.** The
owner opens accounts with outside providers and puts their credentials in a
git-ignored `.env.local`; agents set dev's secrets from there, or generate
random keys, with commands that never print a value. Each stage has its own
values; dev uses a provider's test keys where it has them, and a production
value is never used in dev. No secret value goes in a chat, a bead, the repo,
a log or a test; one that does is leaked and gets rotated.

**Production: only when the owner asks.** Agents act in prod or management
only when the owner asks for that specific action, and never deploy production
or set its secrets. How production is deployed and approved is in the CI
decisions (CI19). Nothing in the dev rules depends on it: prod is a separate
account (A2) with its own SST state and secrets.

## Follow-ups

- **SST stages to accounts:** `production` goes to `<project>-prod` and every
  other stage to `<project>-dev` (the SST dev deployment decisions confirm it).
- **Confirm the SCP on the first dev deploy**, especially the CloudFront
  KeyValueStore exemption (added on a reviewer's inference, not tested).
