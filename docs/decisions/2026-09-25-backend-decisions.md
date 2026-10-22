# Backend — decisions

**Opened:** 2026-09-25, during the backend scaffold design
**Owner:** Yuval Suskin
**Source:** the owner's infrastructure guidelines,
[`2026-09-18-infrastructure-guidelines.md`](2026-09-18-infrastructure-guidelines.md)

Two kinds of entry live here. **Decided** (B1–B9) were settled in the
brainstorm and are implemented by the scaffold. **Open** (O1, O3, O8–O11,
O14, O15 and O17) are the owner's calls, not agent work; each blocks a later
piece of work, named in the table. Only the technical rows are kept: B10 and
O2, O4, O5, O6, O7, O12, O13, O16, O18 and O19 were about the first project's
own product, and their
numbers are not reused.

When a decision is made, post it as a comment on its bead, undefer the bead
and drop its `human` label so an agent can implement it, and record a short
"Decided:" line here.

> **Changed 2026-09-29.** Decisions now reach the owner through review
> batches (`/review-batch`, `.claude/skills/review-batch/`): an agent drafts
> each open decision as a recommendation, the owner approves it on the
> batch's review page, and the batch lead records the `Decided:` line here,
> posts the full text on the bead, and closes the bead, which names the beads
> that build it.

## Decided

| #   | Decision                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | *Superseded by the SST dev deployment decisions: the scaffold started with no infrastructure; the `deploy/` package now holds the SST app.*                                      |
| B2  | DynamoDB                                                                                                                                                                         |
| B3  | One Hono app in one Lambda, sub-apps per audience, split-ready, same origin under `/api/`                                                                                        |
| B4  | Auth: only the hook, deny-all in production. **Visitors without an account never log in**: a link code is the key, a device cookie is the identity, and those routes never take an owner's id |
| B5  | Authorization: per-resource membership, permissions in code, org-ready; `authorize()` is the only gate; 404 for resources the caller cannot see, 403 for a missing permission   |
| B6  | Testing: tiers by risk, sweeps from registries, contract suites for adapters, a sibling test per use-case                                                                        |
| B7  | Observability and metering: AWS-native behind ports, automatic log context, no personal data, metrics catalog empty, usage per unit (the thing the product is priced by) through logs then rollup |
| B8  | Turborepo (local cache), `packages/contracts` (with a zod-free client entry), `packages/config`, MSW from contracts. **Closes the frontend's D7**                                |
| B9  | One graph-driven CI workflow. *Since CI17 the gate is the local proof (`2026-10-06-ci-decisions.md`); the selection by graph stays.*                                              |

## Open

| #   | Decision                                                | Blocks                                                  |
| --- | ------------------------------------------------------- | ------------------------------------------------------- |
| O1  | Sign-in provider (**decided**)                          | the first feature that needs sign-in; any shared deploy |
| O3  | CDN plan (**decided**)                                  | the first deploy                                        |
| O8  | SST confirmation (**decided** with the frontend's D4)   | all infrastructure                                      |
| O9  | Monitoring                                              | going live                                              |
| O10 | Audit trail                                             | the first features that change data                     |
| O11 | Usage rollup                                            | usage dashboards and billing                            |
| O14 | Cost alarms                                             | going live                                              |
| O15 | Backups (**decided**)                                   | going live                                              |
| O17 | Roles and their permissions (**decided** in part)       | the first feature that gives someone a role             |

### O1 — Sign-in provider

For the people who run the product (the app's signed-in side). Options:
Cognito, a library such as Better Auth, or our own OTP by phone or WhatsApp.
Also decide how a shared staging environment authenticates if it is deployed
before the provider exists: production carries a deny-all authenticator until
then.

**Decided:** 2026-09-26, Yuval Suskin. Amazon Cognito, Essentials tier, in the
project's region; the first version signs in with Google only, through our own
sign-in page. Further providers (Facebook, for example) come later, once the
privacy policy and data-deletion page they need are published. Self-signup is
deferred behind an invite allowlist (a Pre sign-up trigger). Our `accountId`
maps to one or more Cognito identities, and nothing keys on the Cognito id.
Each stage has its own user pool. Phone SMS login is deferred, planned through
Cognito's custom SMS sender and a local gateway.

### O3 — CDN plan

Which CloudFront flat-rate tier (Pro or Business) and its request budget, and
what would trigger a move to R2. Thumbnails and other small files are the
request driver: one scroll is hundreds of requests.

**Decided:** 2026-09-26, Yuval Suskin. Pay-as-you-go for now, with no flat-rate
plan. The first 1 TB and 10M requests a month are free. WAF runs in production
only: one web ACL with a per-IP rate rule, about $15 a month. Invalidations use
wildcards, one path per changed file or owner. Pro does not fit: SST's `Nextjs`
component creates a custom cache policy, which the plans allow only from
Business up. Move production to Business ($200) when the CloudFront and WAF
bill nears $150–200 a month, which is the break-even at roughly 30–35M
requests or 2.5 TB; a cost alarm (O14) watches for it. R2 remains a later
option, for when transfer outgrows even Business.

### O8 — SST confirmation

**Decided together with the frontend's D4 gate.** The scaffold's
`dist/api.mjs` is deployed as built through SST's `bundle` option, not
re-bundled by SST, so the artifact the bundle tests checked is the one
deployed.

SST v4 with OpenNext pinned to 4.1.x. A claim that SST is in maintenance mode
traces to unsourced third-party posts; its changelog and README say nothing
of it. What is confirmed: v4 is current (v4.0.0 on 2026-02-24), the latest
release when this was decided was v4.17.1 on 2026-07-12, its built-in defaults
are stale (OpenNext 3.9.14, while 4.1.5 was current), and the team's focus is
OpenCode. Check release activity every quarter; if it stalls, move gradually
to plain Pulumi (infrastructure guidelines, section 4).

### O9 — Monitoring

Which custom metrics to track (the catalog in
`backend/src/platform/metrics.ts` ships empty), alarms and where they notify,
dashboards, log retention, and tracing (X-Ray or OpenTelemetry). The real
Powertools Metrics adapter is wired with the first catalogued metric. Where a
stage's alarms notify is a bootstrap answer: the owner's email address.

### O10 — Audit trail

Logs answer "what happened this month". "Who changed this eight months ago?"
needs a durable audit record. Data-model work; decide with the first features
that change data.

### O11 — Usage rollup

Usage lines are written now (`type: "usage"`). Decide the scheduled job's
interval and the per-unit, per-day usage table's design.

### O14 — Cost alarms

**Owner:** important; what, where and how is undecided. Options: AWS Budgets
alerts, Cost Anomaly Detection, and thresholds on the per-unit usage meters
(for example a unit whose paid-service calls jump).

### O15 — Backups

**Owner:** important for data users cannot recreate. **Constraint:** no backup
leaves the project's region (infrastructure guidelines, A1 and A3), so
cross-region replication is out. Options inside the region: S3 Versioning with
Object Lock, AWS Backup with a vault in the region (optionally in a separate
AWS account, against account compromise), or same-region replication to a
second bucket; and DynamoDB point-in-time recovery.

**Decided:** 2026-09-27, Yuval Suskin. A minimal MVP that covers only the
sensitive data, built at going live, not now. A backup is useless without a
practised recovery plan, and files that users can upload again are not the
sensitive part; records are.

- **DynamoDB:** point-in-time recovery on every table, 30 days
  (`RecoveryPeriodInDays = 30`; about $0.26 per GB-month, about $5 a month at
  20 GB), and deletion protection on every table (free).
- **One runbook:** restore a table to a point in time into a new table, then
  copy back only the affected items; practised once before going live.
  Smaller deletions inside the window can come back; the runbook checks for
  them by hand.
- **Files (S3): no backup and no versioning.** Production buckets use SST's
  `removal: "retain"`, so a bad deploy cannot delete them. If files are lost,
  the user uploads them again.
- **Sign-in accounts (Cognito):** nothing needed. Sign-in is through an outside
  account, so an account can be linked again, and the `accountId` mapping
  lives in DynamoDB.
- **Deferred,** until a paying customer needs a recovery guarantee or files
  stop being re-uploadable: S3 versioning; a separate backup account with
  same-region replication (deletes must be explicit calls; lifecycle delete
  markers do not replicate); AWS Backup (about 6 to 10 times the cost); weekly
  cross-account DynamoDB copies; scheduled restore drills.
- **The first practice restore runs in the dev account,** on a stage of its own
  with test data. The practice needs point-in-time recovery and deletion
  protection on in dev, so the backend infrastructure turns both on from its
  first deploy.

### O17 — Roles and their permissions

**Owner (2026-09-25):** open; it depends on how the features are built. The
scaffold's `owner`, `admin`, `editor` and `viewer` are placeholders that let
authorization be built and tested, not a decision. What is settled is the
mechanism: code checks **permissions** (`resource.edit`), never role names, so
roles can be renamed, added or removed by editing one map in
`backend/src/authz/roles.ts` and the `Role` list in `@acme/contracts`.
Questions: which people exist per resource; whether any role spans resources
(an organisation, B5); and which permissions each needs.

**Decided (in part):** 2026-10-16, Yuval Suskin: "Lets keep it simple with one
role for now but with the infra to easily add more later on."

- **One role besides the resource's creator, for now.** What it sees and does,
  and what only the creator keeps, is the product spec's.
- **The role is an entry in the role-to-permission map**
  (`backend/src/authz/roles.ts`) and the `Role` list in
  `@acme/contracts`, like any other, never a special case in code. A later
  role is a change to that map and that list, not new checks.
- **Still open:** whether any role spans resources (B5).
