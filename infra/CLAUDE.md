# infra/

The platform layer: cloud accounts, identity, guardrails, DNS. Start with
[`README.md`](README.md); each platform has its own folder (`aws/`).

## Rules

- **These files describe live systems.** When you change a platform, update
  its README in the same change, including the History section. A README that
  disagrees with the real account is a bug.
- **Nothing on the platform is changed without the owner.** Explain what
  will change and why, and wait for a go-ahead before running anything that
  creates, changes or deletes platform resources (accounts, users,
  permission sets, organization policies, the region guardrail SCP, regions,
  the `<domain>` zone). Read-only calls (`list`, `describe`, `get`) are
  fine.
- **Dev is the agents' to run (A9).** In `acme-dev`, deploy, update and
  remove the app's resources without asking: any kind billed only by use,
  and records inside `dev.<domain>`. Read `sst diff` before each deploy.
  `dev` is the shared stage; a bead that needs its own takes one named after
  it and removes it when the bead closes. Never remove `dev` or the data
  the owner keeps in it.
- **Nothing billed while idle without the owner.** Acme is pay per use
  (root `CLAUDE.md`): an idle system costs close to nothing beyond stored
  bytes and small fixed items (a hosted zone, a key). A resource billed by
  the hour whether or not it is used (a NAT gateway, a database or cache
  instance, provisioned concurrency, a running container, a flat-rate plan)
  goes to the owner as a review-batch item, with the pay-per-use options it
  was compared to; continue other work meanwhile.
- **Secrets never show.** Each stage has its own values; dev uses a
  provider's test keys where it has them, and a production value is never
  used in dev. The owner opens provider accounts and puts their credentials
  in a git-ignored `.env.local`; agents set dev's secrets from there (for
  example `sst secret set Name --stage dev --fallback < file`, so every dev
  stage inherits them) or generate random keys, never printing a value.
  List secrets by name only. No value goes in a chat, a bead, the repo, a
  log or a test; if one does, tell the owner: it is leaked and gets rotated.
- **Production is off limits without explicit permission.** Do not use the
  `acme-prod` or `acme-management` profiles, deploy production, set
  its secrets or start a production workflow, unless the owner asked for
  that specific action. The default profile is dev. Production deploys only
  through `.github/workflows/deploy-production.yml`, which the owner starts
  with the sha of a proven commit on main, plan first, then release (CI
  decisions CI19). What production needs before its first release is the owner's
  launch checklist.
- **`dev` is deployed from the Mac after merges** (CI decisions CI17), as
  the runbook's _The deploy pipeline_ says; `deploy-dev.yml`, started by
  hand on `main`, is the fallback. Its GitHub deploy role is
  `aws/github-deploy.yaml` (`aws/README.md`).
- **One-time setup scripts are not committed.** Keep them outside the repo,
  have them reviewed before they run, and record their result in the README.
- **Committed policy files are the source of truth** for the live policy
  (`aws/region-guardrail-scp.json` is the region guardrail SCP, naming
  `<region>`). Change the file first, then apply it.
- **Data stays in the chosen region.** Regional AWS resources go in
  `<region>` only (`deploy/accounts.json` names it); the region guardrail SCP
  enforces it in dev and prod. Needing another region is an owner decision,
  not a workaround.
- **Accounts are a bootstrap answer.** Until `/bootstrap accounts` has run,
  `deploy/accounts.json` is empty, no AWS account exists for the project, and
  the account details in `aws/README.md` are placeholders (`<dev-account-id>`
  and the like) for it to fill in.
- App resources are not managed here: they are SST code in `deploy/`
  (`deploy/CLAUDE.md`; runbook: `docs/runbooks/deployment.md`).
