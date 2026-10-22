# AWS

How acme's AWS is organised, who can get in, and how to change it.
Decisions and their reasons: [`docs/decisions/2026-09-28-aws-account-decisions.md`](../../docs/decisions/2026-09-28-aws-account-decisions.md).

**This file is a template until `/bootstrap accounts` has run.** The
account, Organization and Identity Center IDs in angle brackets are bootstrap
answers (`.claude/skills/bootstrap/fills.json` lists each placeholder with the
step that fills it). The accounts step fills them in, here and in
[`deploy/accounts.json`](../../deploy/accounts.json), adds a History entry
and removes this paragraph. The region, `<region>`, and the domain,
`<domain>`, are the basics step's answers. Until then no AWS account exists
for the project and nothing deploys.

## At a glance

| Account           | ID                        | Holds                                      | Root email              | Your role (session)             |
| ----------------- | ------------------------- | ------------------------------------------ | ----------------------- | ------------------------------- |
| acme (management) | `<management-account-id>` | billing, the Organization, Identity Center | `<owner-name>@<domain>`      | `AdministratorAccess` (12 h)    |
| acme-dev          | `<dev-account-id>`        | development, previews, staging             | `<owner-name>+dev@<domain>`  | `AdministratorAccess` (12 h)    |
| acme-prod         | `<prod-account-id>`       | production: real customers, real data      | `<owner-name>+prod@<domain>` | `AdministratorAccessProd` (3 h) |

- **Region:** `<region>` for everything. If it is an opt-in region, it must
  be enabled in all three accounts, and any new account needs it enabled
  before anything else.
- **Organization:** `<org-id>`, root `<root-id>`, all features.
- **Nothing runs in the management account.** It holds billing and identity
  only. App resources go in dev or prod.
- The dev and production account IDs also go in `deploy/accounts.json`
  (`stages.dev.account`, `stages.production.account`). A project with one
  account puts the same ID in both and records that in the decisions.

```
Organization <org-id>               AI services opt-out <opt-out-policy-id> at the root
├── acme (management)                no workloads; SCPs never apply here
└── Workloads  <ou-id>               region guardrail SCP attached
    ├── acme-dev   <dev-account-id>
    └── acme-prod  <prod-account-id>
```

## Signing in

People sign in through **IAM Identity Center**, never as root and never with
IAM users or access keys.

- **Portal:** `<sso-start-url>` (console and CLI)
- **Identity Center instance:** `<sso-instance-id>`, home region `<region>`,
  identity store `<identity-store-id>` (Identity Center's own directory, no
  external identity provider)
- **Users:** `<owner-name>`
- **Permission sets:**

  | Name                      | Policy                            | Session | Assigned on     |
  | ------------------------- | --------------------------------- | ------- | --------------- |
  | `AdministratorAccess`     | AWS managed `AdministratorAccess` | 12 h    | management, dev |
  | `AdministratorAccessProd` | AWS managed `AdministratorAccess` | 3 h     | prod            |

### Root users

- **Management:** root is `<owner-name>@<domain>`, with MFA. Not for daily use.
- **Dev and prod: no root sign-in at all.** Centralized root access
  management is on for the Organization: the member roots have no password,
  keys, MFA or certificates, and password recovery through their `+dev` and
  `+prod` emails is blocked. The only way into dev and prod is SSO. Their
  emails still receive AWS notices.

The few tasks that need a member account's root are done from the management
account instead: IAM console → Root access management → pick the account →
Take privileged action (unlock an S3 bucket or SQS queue policy that denies
everyone, audit or delete root credentials). For anything else root-only
(rare: that account's Support plan, S3 MFA delete), take the privileged
action **Allow password recovery**, reset the password from the account's
email, do the task, then **Delete root credentials** again.

Audit that the member roots are still empty (read-only; expects `none` and
zeros):

```bash
export AWS_PROFILE=acme-management
for id in <dev-account-id> <prod-account-id>; do
  read -r AK SK ST <<<"$(aws sts assume-root --region <region> --target-principal $id \
    --task-policy-arn arn=arn:aws:iam::aws:policy/root-task/IAMAuditRootUserCredentials \
    --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text)"
  (unset AWS_PROFILE; export AWS_ACCESS_KEY_ID=$AK AWS_SECRET_ACCESS_KEY=$SK AWS_SESSION_TOKEN=$ST AWS_REGION=<region>
   echo "$id"; aws iam get-login-profile 2>&1 | grep -q NoSuchEntity && echo "  password: none" || echo "  password: PRESENT"
   aws iam list-access-keys --query 'length(AccessKeyMetadata)' --output text
   aws iam list-mfa-devices --query 'length(MFADevices)' --output text)
done
```

## The CLI

AWS CLI v2 (Homebrew: `brew install awscli`). `~/.aws/config`:

```ini
[sso-session acme]
sso_start_url = <sso-start-url>
sso_region = <region>
sso_registration_scopes = sso:account:access

# Anything that names no profile lands in dev.
[default]
sso_session = acme
sso_account_id = <dev-account-id>
sso_role_name = AdministratorAccess
region = <region>

[profile acme-dev]
sso_session = acme
sso_account_id = <dev-account-id>
sso_role_name = AdministratorAccess
region = <region>

[profile acme-prod]
sso_session = acme
sso_account_id = <prod-account-id>
sso_role_name = AdministratorAccessProd
region = <region>

[profile acme-management]
sso_session = acme
sso_account_id = <management-account-id>
sso_role_name = AdministratorAccess
region = <region>
```

`acme-dev` and `acme-prod` are the profile names `deploy/src/stage.ts`
(`awsProfile`) uses on a laptop; GitHub Actions has no profiles and uses the
deploy role's credentials.

Day to day:

```bash
aws sso login                                   # once per session; covers every profile
aws sts get-caller-identity                     # dev (the default)
aws sts get-caller-identity --profile acme-prod
```

One login reaches every account the user is assigned to. Choosing dev as the
default protects against accidents, not against intent: see "Prod access" in
the decisions file.

## The region guardrail

A service control policy (`RegionGuardrail`, `<scp-id>`) on the Workloads OU.
Its source is [`region-guardrail-scp.json`](region-guardrail-scp.json),
which names the project's region, `<region>` (twice, written there by the
basics step); the live policy is created from that file as it is, so the two
must match.

- **Denies every action outside `<region>`**, except global services (IAM,
  STS, Organizations, CloudFront, Route 53, ACM, WAF, billing, support and
  others in the file's `NotAction` list). Based on AWS's published example,
  [aws-samples/service-control-policy-examples](https://github.com/aws-samples/service-control-policy-examples/tree/main/Region-controls).
- **Denies enabling or disabling regions** from inside dev or prod. Only the
  management account can do that.
- **Never applies to the management account**; that is how SCPs work.

What it blocks, on purpose or as a side effect:

- Lambda@Edge, and CloudFront function logs, which live in `us-east-1`.
  (CloudFront standard logs' delivery configuration is the one `logs:`
  exception: allowed in `us-east-1` only.)
- CloudWatch billing alarms (`us-east-1` only). Use AWS Budgets, which is
  exempt.
- Billing, payment and account-contact changes from inside dev or prod. Do
  those in the management account.

What it cannot do: stop CloudFront caching content at edge locations outside
the region. That is a product question (the CDN plan).

Check it still holds (both must fail with "explicit deny in a service control
policy"; pick a region other than `<region>`):

```bash
aws dynamodb list-tables --profile acme-dev --region <other-region>
aws lambda list-functions --profile acme-prod --region <other-region>
```

Change it: edit the JSON, get it reviewed, then from the management account

```bash
aws organizations update-policy --profile acme-management --policy-id <scp-id> \
  --content file://infra/aws/region-guardrail-scp.json
```

SCP size limit is 5,120 characters minified; the file is about 2,050.

## The AI services opt-out

AWS may store and use what its AI services receive to improve them, possibly
outside the region, unless an AI services opt-out policy covers the account
(AWS Service Terms §50.3). It is on before the first real user content
reaches any AI service. Source: [`ai-opt-out-policy.json`](ai-opt-out-policy.json),
opting every AI service out (`default`), attached at the Organization's root
so dev and prod both inherit it.

Create it once, from the management account:

```bash
aws organizations enable-policy-type --profile acme-management --root-id <root-id> --policy-type AISERVICES_OPT_OUT_POLICY
aws organizations create-policy --profile acme-management --type AISERVICES_OPT_OUT_POLICY --name AiServicesOptOut --description "Opt every AWS AI service out of using our content" --content file://infra/aws/ai-opt-out-policy.json --query Policy.PolicySummary.Id --output text
aws organizations attach-policy --profile acme-management --target-id <root-id> --policy-id <opt-out-policy-id>
```

**Check it from a member account** (read-only; agents run it from dev, and
a member account cannot read the policy itself, only its effect):

```bash
aws organizations describe-effective-policy --policy-type AISERVICES_OPT_OUT_POLICY --query EffectivePolicy.PolicyContent --output text
```

It must print `{"services":{"default":{"opt_out_policy":"optOut"}}}` (the
file's `@@assign` resolved). Anything else, or "policy type not enabled",
means the opt-out is gone: switch off any feature that sends content to an AI
service before anything else.

Change it: edit the JSON, then from the management account

```bash
aws organizations update-policy --profile acme-management --policy-id <opt-out-policy-id> --content file://infra/aws/ai-opt-out-policy.json
```

## How to

**Give someone access.** Identity Center → Users → Add user (they get an
email invite and set their own password and MFA). Then AWS accounts → pick
the account → Assign users or groups → pick a permission set. Start newcomers
on dev only.

**Add an account.** Accounts are free but capped: the Organization allows 5
(3 used), and closed accounts keep counting for 90 days. In the management
account:

1. `aws organizations create-account --account-name <name> --email <owner-name>+<name>@<domain>`
   and wait for `describe-create-account-status` to say `SUCCEEDED`.
2. `aws organizations move-account` it from the root into the Workloads OU,
   so the region guardrail applies.
3. If `<region>` is an opt-in region: `aws account enable-region --account-id <id> --region-name <region>`,
   and wait for `get-region-opt-status` to say `ENABLED` (minutes, sometimes
   hours). Identity Center cannot give access before this.
4. Assign a permission set to the user in Identity Center.
5. Add a profile to `~/.aws/config` and to this file.

**Re-login when a session expires.** `aws sso login`. Dev and management
sessions last 12 hours, prod 3.

## Also created by the setup

- Each member account has `OrganizationAccountAccessRole`, a full-admin role
  the management account can assume. It is the way back in if Identity Center
  access to that account ever breaks.
- Trusted access in the Organization is on for `sso.amazonaws.com` (Identity
  Center), `account.amazonaws.com` (managing member accounts' regions) and
  `iam.amazonaws.com` (centralized root access).
- Centralized root access features on: `RootCredentialsManagement` and
  `RootSessions` (`aws iam list-organizations-features`). Switching them off
  (`aws iam disable-organizations-root-credentials-management`,
  `disable-organizations-root-sessions`) restores the old behaviour.
- Enabling SCPs attached AWS's default `FullAWSAccess` policy to the root, the
  OU and every account. Leave it: SCPs only remove permissions, and without
  it nothing is allowed.
- **A budget alert on each account** (AWS Budgets, no idle cost), at a
  monthly amount the owner gives; `/bootstrap accounts` offers it.

## The app's stages (SST)

The app's resources are SST code in `deploy/`; what a stage contains, and
how to deploy, smoke test and tear one down, is the runbook
[`docs/runbooks/deployment.md`](../../docs/runbooks/deployment.md).

- **`acme-dev`** holds the `dev` stage and any throwaway stage a bead needs.
- **SST's bootstrap** in each account, created on its first deploy in
  `<region>`: the state bucket `sst-state-<id>` (stage state and encrypted
  secrets), the asset bucket `sst-asset-<id>`, the ECR repository `sst-asset`
  (empty; only containers would use it), and the SSM parameters
  `/sst/bootstrap` and `/sst/passphrase/acme/<stage>`. All pay per use;
  nothing billed while idle beyond stored bytes.
- **`acme-prod`** holds the `production` stage, released only by
  `.github/workflows/deploy-production.yml`.

### GitHub deploy role

GitHub Actions deploys a stage as the role `github-deploy-<stage>` in that
stage's account, through GitHub's OIDC token: no keys are stored anywhere.
Source: [`github-deploy.yaml`](github-deploy.yaml), a CloudFormation
template (stack `github-deploy-<stage>`); change the file first, then apply
it. How the pipeline uses it and what it may do: the runbook,
[`docs/runbooks/deployment.md`](../../docs/runbooks/deployment.md), _The deploy
pipeline_. The workflows read the role's account and region from
`deploy/accounts.json` and skip themselves while it is empty.

| Account     | Stack                      | What it holds                                                                                                                                            | Trusts (the token's `sub`)                                                                                                                              |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acme-dev`  | `github-deploy-dev`        | the OIDC provider `token.actions.githubusercontent.com` (audience `sts.amazonaws.com`); the policy `acme-app-role-boundary`; the role `github-deploy-dev` | `repo:<github-owner>@<github-owner-id>/<github-repo>@<github-repo-id>:ref:refs/heads/main:job_workflow_ref:<github-owner>/<github-repo>/.github/workflows/deploy-dev.yml@refs/heads/main`         |
| `acme-prod` | `github-deploy-production` | the OIDC provider; the policy `acme-app-role-boundary`; the role `github-deploy-production` (`ShortNamePattern=p*-*`)                                    | `repo:<github-owner>@<github-owner-id>/<github-repo>@<github-repo-id>:environment:production:job_workflow_ref:<github-owner>/<github-repo>/.github/workflows/deploy-production.yml@refs/heads/main` |

The subject's `@<id>`s are the owner's and the repository's numeric ids
(GitHub's immutable subject, on for the repository): a repository or account
recreated under the same name is not trusted. AWS checks only `sub` and
`aud`, so every trusted subject is an exact string.

**`acme-app-role-boundary`** is the permissions boundary every app role
carries (SST sets it on every role it creates, `deploy/sst.config.ts`): the
most a function may do. The deploy role may create a role, or change its
policies, only with it. One per account, created by the account's first
stack (`CreateAccountResources=true`); throwaway stages deployed with SSO
carry it too, so it must exist before any deploy in an account.

`AppInitial` is the first letter of the app's name, which the stack has no
way to read: SST names resources `<app>-<stage>-...`, cut short on long
names, and every pattern in the template is the letter, a star and the
stage. `ManagesDomain=true` once the stage has a domain: Route 53, ACM and
SES.

Apply or change it in dev (the role's permissions, or its trusted subjects,
a comma-separated list):

```bash
aws cloudformation deploy --profile acme-dev --region <region> \
  --stack-name github-deploy-dev --template-file infra/aws/github-deploy.yaml \
  --capabilities CAPABILITY_NAMED_IAM --tags acme:app=acme acme:part=github-deploy \
  --parameter-overrides Stage=dev AppInitial=a CreateAccountResources=true ManagesDomain=true \
  "TrustedSubjects=repo:<github-owner>@<github-owner-id>/<github-repo>@<github-repo-id>:ref:refs/heads/main:job_workflow_ref:<github-owner>/<github-repo>/.github/workflows/deploy-dev.yml@refs/heads/main"
aws cloudformation detect-stack-drift --profile acme-dev --region <region> --stack-name github-deploy-dev   # changed by hand?
```

In prod, with production's parameters (the table's row):

```bash
aws cloudformation deploy --profile acme-prod --region <region> \
  --stack-name github-deploy-production --template-file infra/aws/github-deploy.yaml \
  --capabilities CAPABILITY_NAMED_IAM --tags acme:app=acme acme:part=github-deploy \
  --parameter-overrides Stage=production AppInitial=a CreateAccountResources=true ManagesDomain=true \
  "ShortNamePattern=p*-*" \
  "TrustedSubjects=repo:<github-owner>@<github-owner-id>/<github-repo>@<github-repo-id>:environment:production:job_workflow_ref:<github-owner>/<github-repo>/.github/workflows/deploy-production.yml@refs/heads/main"
```

With one account for both stages, the production stack passes
`CreateAccountResources=false`: the dev stack already created the account's
OIDC provider and `acme-app-role-boundary`, and a second copy of either fails
the stack. Both CLI profiles, `acme-dev` and `acme-prod`, then point at that
one account (`deploy/src/stage.ts`, `awsProfile`, names one per stage).

(`AppInitial=a` is acme's; a renamed project passes its own letter.) To try
a permission change before it merges, add the branch's subject
(`…:ref:refs/heads/<branch>`) to `TrustedSubjects`, run the deploy action from
a temporary workflow on that branch against `dev`, then apply again without
it. A first deploy from nothing is proven the same way with a stack for a
throwaway stage (`--stack-name github-deploy-<stage>`, `Stage=<stage>`,
`CreateAccountResources=false`), deleted afterwards
(`aws cloudformation delete-stack`).

### What the region and the SCP allow

What the skeleton's stack needs, and what the guardrail does to it. Re-check
it on the first deploy in `<region>`: a region may lack a service, and
`/bootstrap accounts` records what it finds under History.

| Needed by the stack                                                              | Result                                                                                                                                          |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| SST's state and asset buckets, SSM parameters, ECR repository                    | allowed: `<region>`                                                                                                                             |
| Lambda, API Gateway HTTP APIs, DynamoDB, S3, CloudWatch log groups               | allowed: `<region>`                                                                                                                             |
| IAM roles                                                                        | allowed: IAM is exempt                                                                                                                          |
| CloudFront distribution, functions, KeyValueStore, cache policies, invalidations | allowed: `cloudfront:*` and `cloudfront-keyvaluestore:*` are exempt                                                                             |
| ACM certificate and Route 53 records (once a domain is set)                      | allowed: exempt                                                                                                                                 |
| SES (the contact message's mail)                                                 | allowed: `<region>`, if SES runs there; accounts start in SES's sandbox                                                                         |
| **Lambda function URLs**                                                         | **not available in every region**: every Lambda the public reaches sits behind an API Gateway HTTP API, and SST's `Nextjs` component is not used |
| **CloudFront standard logs**                                                     | allowed in `us-east-1` by the file's `DenyLogDeliveryOutsideRegionAndUsEast1` statement; legacy logs cannot go to an opt-in region's bucket     |
| Listing CloudFront resources through the tagging API                             | blocked (`tag:*` in `us-east-1`); CloudFront's own API is used instead                                                                          |

## History

Newest last. Each entry says what changed and the date; `/bootstrap accounts`
adds the first ones (the Organization, the accounts, the profiles, the SST
bootstrap, the first deploy).
