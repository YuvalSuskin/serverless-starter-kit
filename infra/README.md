# Infrastructure

The platform Acme runs on: cloud accounts, who can sign in, guardrails and
DNS. Set up by hand or one-time scripts, and changed rarely.

Not here: the app's own resources (tables, buckets, functions, the site).
Those are code, deployed by SST from `deploy/` (runbook:
`docs/runbooks/deployment.md`).

| Platform   | What we use it for                                       | Details                          |
| ---------- | -------------------------------------------------------- | -------------------------------- |
| AWS        | everything the app runs on, in `<region>` | [`aws/README.md`](aws/README.md) |

Why things are the way they are lives in `docs/decisions/`; this folder says
what exists now and how to work with it. For AWS:
[`docs/decisions/2026-09-28-aws-account-decisions.md`](../docs/decisions/2026-09-28-aws-account-decisions.md).
