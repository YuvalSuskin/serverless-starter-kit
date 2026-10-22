# Infrastructure decisions

> **Source document, scrubbed for the template.** The owner wrote it for the
> first project built on this stack. The template keeps the stack choices and
> the rules that apply to any project; the sections that only made sense for
> that project's own pipeline are gone. Section numbers are kept, so a number cited elsewhere still points
> here. Technical decisions built on it:
> [`2026-09-25-backend-decisions.md`](2026-09-25-backend-decisions.md).

---

## 1. Cloud: all AWS for the MVP; Cloudflare later if cost requires it

* Decision: S3 + CloudFront + Lambda, all on AWS, with other AWS services as the project needs them. Move the user-facing serving layer to Cloudflare R2 later if the bill asks for it (see section 5).
* Why: it's the simplest setup, with one cloud and native S3 events. R2's main advantage is free downloads (S3 charges ~$0.09/GB; R2 charges $0). Showing a file in the browser counts as a download for billing.
* Decide with numbers: before any move, price one typical unit of the product (one customer, one month) on both clouds, and move only when the saving repeats on every use.

## 2. Storage lifecycle

* Every kind of stored data has a retention period, set with a lifecycle rule on the bucket. Personal or sensitive data gets the shortest period the product can live with, deleted by a scheduled job.
* Use S3 Intelligent-Tiering rather than manual Glacier moves. If using Glacier, only Instant Retrieval: Flexible Retrieval and Deep Archive take hours to restore, which is bad for users waiting on a page.
* Only move large objects to cheaper tiers (filter to files larger than ~1 MB). Small files are billed as at least 128 KB, so tiering them doesn't save money.
* Keep derived copies (resized or converted versions) small and cache aggressively; fetch the original only when a user asks for it.

## 3. Event-driven pipeline design

* Object keys name their owner and their kind: `<owner-id>/originals/…` for what a user uploaded and `<owner-id>/derived/<kind>/…` for what the system makes from it. Only fire events on the `originals/` prefix, so derived files can't re-trigger the pipeline.
* Handlers must be safe to run twice (events can arrive more than once and out of order); use a dead-letter queue and retries. Track each item's status in the database.
* Flow: S3 upload event → queue → worker (or Step Functions for several steps) → save results → notify.
* Uploads use presigned URLs, with multipart uploads for large files.
* Check each file's actual type, not its extension. Strip location data from anything served to users.
* Bulk uploads: batch the queue consumers and throttle to the rate limits of the services they call.
* Archives built on demand (a bundle of many files for one download) expire after a few days.

## 4. Infrastructure tool: SST

* Decision: SST, over Serverless Framework v4 and plain Pulumi.
* Why:
   * `sst dev` runs Lambdas on your machine against real AWS, with breakpoints; this was the deciding factor.
   * TypeScript config.
   * `link` handles IAM permissions and typed access to resources.
   * Built-in Step Functions and CloudFront components.
   * Supports Cloudflare too, so the later R2 move can stay in the same tool.
* Rejected:
   * Serverless Framework v4: login or license key required on every deploy (including CI), paid above $2M revenue, YAML plus plugins (Step Functions needs a plugin), CloudFormation's 500-resource-per-stack limit, AWS only.
   * Plain Pulumi: no dev loop (`pulumi watch` takes ~30–90 s per change), and roughly 3–5× more infrastructure code.
* Known risk: SST's maintenance is uncertain. The team shifted focus to OpenCode, and third-party posts call SST "maintenance mode". npm shows v4.0 released in Feb 2026 and 127 releases in 2026, the latest (4.17.1) on 2026-07-12.
* How we reduce that risk:
   * Pin the exact SST version.
   * Write any missing pieces as raw Pulumi resources in `sst.config.ts`.
   * Check release activity every quarter; if it stalls, move gradually to plain Pulumi.
* SST quirks to expect:
   * Pulumi `Output` values sometimes need `$resolve` or `.apply`.
   * Files your code doesn't import need `copyFiles`.
   * AWS cron schedules use 6 fields.
   * Placeholder Lambdas stay deployed after stopping `sst dev`; redeploy to restore them.

## 5. Serving layer: postponed to R2, but built for from day one

Decision: serve everything from S3 + CloudFront at launch. Later, if the CloudFront bill passes roughly $100 a month, move the user-facing derived files to R2, where serving is free. Build the MVP so that move is a config change, not a refactor. The cost of putting a file in R2 is one transfer out of AWS (~$0.09/GB), while the saving repeats on every view. Track bytes served per owner so the threshold is visible.

Build rules that make the swap cheap:

1. One storage module. All object access goes through a small adapter (`put`, `getSignedUrl`, `delete`, `exists`) with an S3 implementation. R2 speaks the same S3 API, so adding it means a new endpoint plus credentials.
2. Storage targets, not buckets, in code. Refer to `originals` and `derived` as named targets resolved from config, so `derived` can be pointed at R2 via an environment variable.
3. Identical keys in both stores. The same key path works in S3 and R2, so a file can move without any database change.
4. Store keys, never URLs, in the database. Every user-facing URL comes from a single helper. Clients never see a raw S3 or CloudFront URL.
5. Access control behind one module. Private files get short-lived signed URLs produced by one function. Callers shouldn't notice which store signed them.
6. Content-hashed, immutable keys plus long cache headers, so changing the serving layer doesn't invalidate caches or break links.
7. Stick to plain object operations on the derived path (PUT with content type and cache headers, GET, DELETE). No S3-only features there, since R2 doesn't have them all.
8. One delete path. A single function loops over the configured targets, so adding R2 means adding a target, not another cleanup job.
9. Keep pipeline logic in plain functions (e.g. `handleUploaded(msg)`), separate from the Lambda wrappers.

## Notes for a future Cloudflare move (checked against SST's source)

* SST covers: R2 Bucket, Queue (with DLQ and batching), Workflow, Cron, D1, Durable Objects; linking an AWS resource to a Worker creates scoped IAM keys automatically.
* Needs a few lines of raw Pulumi: the R2 upload event rule (`cloudflare.R2BucketEventNotification`), and an R2 API token for AWS Lambdas (as an `sst.Secret`).
* Not supported in SST: Cloudflare Containers (use Wrangler).
* In `sst dev`, Workers are rebuilt and redeployed on change; they don't run locally.
* Writing files from AWS to R2 costs AWS download fees, so generate files on the side where they'll be stored.
