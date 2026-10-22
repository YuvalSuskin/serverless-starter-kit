# Step 7: Accounts

The project's AWS accounts, so it can deploy. Optional, and any time after
step 1: until it runs, `deploy/accounts.json` is empty, every deploy command
stops with a message naming `/bootstrap accounts`, and the GitHub deploy
workflows skip themselves. The owner may defer it
(`pnpm bootstrap:state defer accounts`) and run it later.

**Needs:** step 1 done (the region, the domain, the slug). For the GitHub
deploy role: the GitHub repository from step 3. The AWS CLI v2 (`aws
--version`). The owner at hand for every sign-in, account creation and
console click: agents never hold an AWS root or management credential.

**Fills:** `<dev-account-id>`, `<prod-account-id>`, `<management-account-id>`,
`<org-id>`, `<root-id>`, `<ou-id>`, `<opt-out-policy-id>`, `<scp-id>`,
`<sso-start-url>`, `<sso-instance-id>`, `<identity-store-id>`, `<owner-name>`,
`<github-owner>`, `<github-owner-id>`, `<github-repo>`, `<github-repo-id>`,
`<platform-resources>`, `<dev-stage-name>` (`fills.json` lists their files).

Nothing here changes the platform without the owner's yes, one action at a
time (`infra/CLAUDE.md`, _Nothing on the platform is changed without the
owner_). Read-only calls are fine. No secret value is ever shown, written or
committed.

## Asks

One question per message, in this order.

1. **The shape:**
   - **one account** for everything: the cheapest to run and the simplest;
     dev and production share it, told apart by stage;
   - **a dev and a production account**, without an Organization;
   - **an Organization** with a management account and dev and production
     under it, as decisions A1 to A9 describe: the template's default, and
     the only shape where the region guardrail SCP and Identity Center apply.

   Recommend the Organization unless the owner wants the least setup now. The
   rest of the repo works the same in every shape.
2. **Existing accounts:** does any account already exist (its ID), or are
   they created now? Which email address each account's root uses (the
   template's pattern is `<owner-name>+dev@<domain>`).
3. **The owner's user name** for Identity Center (`<owner-name>`), where the
   shape has it.
4. **A monthly budget alert per account** (AWS Budgets, no idle cost): the
   amount in USD the owner wants to hear about, per account, and the email it
   goes to. Offer to skip.

## Writes

Walk `infra/aws/README.md` from the top, doing each part the shape has, with
the owner, and fill each token as its value appears:

- **The accounts and the Organization** (_At a glance_, _How to_: add an
  account), the Workloads OU, the region guardrail SCP from
  `infra/aws/region-guardrail-scp.json` as step 1 wrote it, and the AI
  services opt-out (_The AI services opt-out_). An opt-in region is enabled in
  each account first.
- **Sign-in:** Identity Center, the owner's user, the permission sets, and
  the CLI profiles (_The CLI_) named after the slug; `default` points at dev.
  The deploy scripts use a dev and a prod profile (`awsProfile` in
  `deploy/src/stage.ts`, whose `Skeleton:` marker stays until step 6): with
  one account, write both, pointing at it.
- **The GitHub deploy role** (_GitHub deploy role_): the GitHub tokens from
  `gh api repos/{owner}/{repo} --jq '.owner.login, .owner.id, .name, .id'`;
  `AppInitial` is the slug's first letter (the rename already wrote it in
  `infra/aws/github-deploy.yaml`'s examples and the README's commands; check
  them); one stack per stage, applied after the owner's yes. Only the first
  stack in an account passes `CreateAccountResources=true`: with one account,
  the production stack passes `false` (the README says why).
- **`deploy/accounts.json`:** `region` and `domain` from step 1's decisions,
  and `stages.dev.account` and `stages.production.account`. With one account,
  the same ID in both.
- **The template-only test:** delete `template-accounts.test.ts` in
  `deploy/src/`, which holds only while the file is empty (TB38). `deploy/src/stage.test.ts`
  and `sst-script.test.ts` keep testing both states.
- **The deploy workflows** stop skipping once the file is filled, but still
  refuse until step 6 is done: `pnpm sst:deploy` and their first step read
  `.bootstrap/state.json` (`deploy/src/bootstrap-guard.ts`), because the
  skeleton's demo routes are unauthenticated. Only once step 6 is done, check
  that a `workflow_dispatch` of `deploy-dev.yml` on `main` reaches the role;
  it runs only when started by hand (the owner starts it), never on a merge.
- **The two platform memories** in `.beads/seed-memories.json`:
  `<platform-resources>` with what the platform is in this shape (for
  example "the AWS Organization, Identity Center, the region guardrail SCP
  and the `<domain>` zone"), `<dev-stage-name>` with where agents act freely
  (the dev account's name, or "the dev stage" with one account). Import
  `explain-before-infra` again (`SKILL.md`, _Fill tokens_).
- **The budget alerts,** only after the owner confirms the amount and the
  address for each account, in that account:
  `aws budgets create-budget --profile <the account's profile> --account-id <id> --budget
  '{"BudgetName":"monthly","BudgetLimit":{"Amount":"<n>","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}'
  --notifications-with-subscribers '[{"Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":80,"ThresholdType":"PERCENTAGE"},"Subscribers":[{"SubscriptionType":"EMAIL","Address":"<address>"}]}]'`.
  Budgets is a global service the guardrail exempts.
- **A shape other than the Organization:** rewrite `infra/aws/README.md`'s
  sections the shape lacks (no Organization IDs, no OU, no SCP: say what
  keeps the data in the region instead), the root `CLAUDE.md`'s
  Infrastructure paragraph ("Three accounts …") and `infra/CLAUDE.md`'s
  account bullets, so no file describes accounts that do not exist.
- **The placeholder notes:** remove `infra/aws/README.md`'s "This file is a
  template" paragraph and the runbook's sentence saying the names are
  bootstrap answers; `infra/CLAUDE.md`'s "Accounts are a bootstrap answer"
  bullet becomes where the accounts are recorded.
- **History:** an entry in `infra/aws/README.md`'s _History_ for each part
  done (the Organization, the accounts, the profiles, the SST bootstrap, the
  first deploy, the budgets), dated.
- **The first deploy of `dev`,** with the owner's go-ahead, by the runbook
  (`docs/runbooks/deployment.md`, _Deploy a stage_), only after step 6: the
  skeleton's demo routes must never be deployed. Before step 6, stop at
  `pnpm -C deploy sst:diff --stage dev`.

## Records

- BS rows: the shape and why; each account's ID and purpose; the profiles;
  the budget amounts, or "declined"; the deploy role's trusted subjects.
- A shape other than the Organization supersedes A2 (and whichever of A1, A3
  and A5 no longer hold): add the row and mark the old ones *Superseded by
  BS<n>* in `docs/decisions/2026-09-28-aws-account-decisions.md`.
- What the region lacks that the README's table expected, under _History_.

## Done when

- `deploy/accounts.json` holds the region, the domain and both stages'
  accounts, and the template-only accounts test is gone.
- `git grep -F` finds none of this step's tokens outside the bootstrap's own
  files, tests and the template-build log
  (`docs/decisions/2026-10-21-template-build-decisions.md`); a token whose
  part the shape lacks went with its sentence.
- `aws sts get-caller-identity` with the default profile names the dev
  account, and `pnpm -C deploy sst:diff --stage dev` runs.
- Each budget the owner confirmed exists (`aws budgets describe-budgets`).
