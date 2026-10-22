# Step 3: Owner setup

The owner's side of the harness: the GitHub repository and its branch rule,
the owner inbox, and the steps only the owner can take, each on the inbox.

**Needs:** step 1 done. The `gh` CLI signed in as the owner (`gh auth
status`) for the GitHub part; without it, that part becomes an inbox item.

**Fills:** `<owner-inbox-url>`, `<project-account>`, `<registrar-exception>`
(`fills.json` lists their files). The repository's names and ids in
`infra/aws/README.md` are step 7's, which sets up the deploy role that trusts
them.

Everything here that creates or changes something outside the repo (a
repository, a branch rule, a published page) is stated to the owner first,
with exactly what will happen, and done only after a clear yes. A "yes" covers
the action it answered, not the next one.

## Asks

One question per message, in this order.

1. **The GitHub repository:** does one exist (its `owner/name`), or should
   one be created, and under the owner's account or an organization? Private
   is the default.
2. **Go-ahead for the repository** (only when it must be created): state the
   command, `gh repo create <owner>/<name> --private --source . --push`, and
   wait for yes. Pushing runs the pre-push checks; a failure is fixed, never
   skipped.
3. **Go-ahead for the branch rule** on `main` (below): state it in one
   sentence ("main will only accept a merge whose commit carries the
   `local/check-full` and `proof` checks") and wait for yes. Without it the
   proof and the merge gate check nothing (CI17, CI18).
4. **The project's own account:** the account the project's services are
   opened under (a workspace or mailbox at the domain, such as
   `ops@<the domain>`), never the owner's personal one. This is
   `<project-account>`.
5. **Any exception** to that rule the owner wants on record, such as a domain
   already registered under a personal registrar account
   (`<registrar-exception>`); none is the usual answer.
6. **Go-ahead to publish the inbox page:** a private claude.ai page only the
   owner sees until they share it.
7. **Go-ahead for the tracker's remote,** once the repository exists: state
   that the issues and memories will be pushed to `refs/dolt/data` on that
   repository (where `bd dolt pull` finds them on another machine), with the
   commands below, and wait for yes. The rename removed the template's own
   tracker remote from `.beads/config.yaml`. If the copy already had a git
   `origin` when `pnpm rename` ran (GitHub's "Use this template"), `bd init`
   set that origin as the tracker's remote, and `pnpm rename` said so; nothing
   was pushed. Read `.beads/config.yaml`'s `sync.remote` and `bd dolt remote
   list`, and say which case it is: no remote yet, or the project's own
   repository already set, asking to keep it. A remote that is not the
   project's own repository is never kept.

## Writes

- **The repository,** if asked for (question 2), and its remote as
  `origin`.
- **The tracker's remote,** after the yes (question 7), with the project's
  own repository and never the template's. With none set yet:

  ```bash
  bd config set sync.remote "git+https://github.com/<owner>/<name>.git"
  bd dolt remote list    # if it shows none: bd dolt remote add origin <the same URL>
  bd dolt push
  ```

  With the project's own repository already set by `bd init`: `bd dolt push`
  only. `bd config set` writes `sync.remote` into `.beads/config.yaml`; commit
  that change. Without a yes, or for a remote that is not the project's own,
  remove it so the tracker stays local, and a bead says the step is left:

  ```bash
  bd dolt remote remove origin
  bd config unset sync.remote
  ```
- **The branch rule,** after the yes (question 3):

  ```bash
  gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input - <<'EOF'
  { "required_status_checks": { "strict": false, "contexts": ["local/check-full", "proof"] },
    "enforce_admins": false, "required_pull_request_reviews": null, "restrictions": null }
  EOF
  ```

  Then read it back (`gh api repos/{owner}/{repo}/branches/main/protection
  --jq '.required_status_checks.contexts'`) and show the owner. On a plan that
  refuses branch protection for a private repository, say so and make it an
  inbox item; never weaken the rule to make it apply.
- **An organization-owned repository:** `deploy-production.yml` lets only
  `github.repository_owner` start production (TB40), which for an
  organization is the organization, not a person. Write the owner's GitHub
  login in its place in the job's `if:` and the release check's `OWNER`, as
  the file's comment says.
- **The inbox,** after the yes (question 6), through the `owner-inbox` skill,
  _Publishing the page_: publish `.claude/skills/owner-inbox/page.html` as it
  is (its title stays "Owner Inbox", which `tools/sweep/src/owner-inbox.test.ts`
  holds; the project's name goes in the `description`), then put its URL in
  place of `<owner-inbox-url>` in every file `fills.json` lists, and import the
  `owner-inbox` memory again (`SKILL.md`, _Fill tokens_). In the
  `owner-inbox` skill, _Publishing the page_ step 2 says to record the URL
  "each in place of `<owner-inbox-url>`": drop those words with the fill, so
  the step still reads right.
- **If the owner declines the inbox** (question 6): it is how owner questions
  reach them between batches (root `CLAUDE.md`), so say that once, with the
  recommendation. If still no, the practice goes, as one change, so no token
  is left and Finishing can run: the `owner-inbox` skill folder and its test
  (`tools/sweep/src/owner-inbox.test.ts`); the `owner-inbox` memory (its entry
  in `.beads/seed-memories.json` and in `tools/sweep/src/memories.test.ts`'s
  key list, then `bd forget owner-inbox`); the `<owner-inbox-url>` entry in
  `fills.json` and in `tools/bootstrap/src/fills.test.ts`'s required list; and
  the root `CLAUDE.md` bullet's inbox sentences, which become "between
  batches, a question waits for the next review batch" (its paragraph on the
  skeleton keeps the `Skeleton:` marker until step 6). The owner-only steps
  below become beads labelled for the next batch instead of inbox items.
- **The two account memories:** `<project-account>` and
  `<registrar-exception>` in `.beads/seed-memories.json`. With no exception,
  delete the memory's exception sentence (the one that holds
  `<registrar-exception>`) instead of filling it. Import
  `project-accounts-only` again.
- **The owner-only steps,** as `step` items on the inbox (`owner-inbox`
  skill, _Adding an item_), each with its steps and what it unblocks, and a
  bead:
  - register the domain (if step 1 recorded it as planned or provisional);
  - open the project's own account (question 4), if it does not exist;
  - AWS accounts: point to `/bootstrap accounts` (step 7), any time;
  - put each third-party service's keys in the git-ignored `.env.local`
    (`infra/CLAUDE.md`, _Secrets never show_): an item only once a feature
    needs a key; until then a bead says the step exists, and no item;
  - whatever this step could not do itself (the repository, the branch
    rule), with the exact commands.

## Records

- BS rows: the repository (owner, name, private or not, organization-owned or
  not); the branch rule, applied on which date, or why not yet; the tracker's
  remote, or why not yet; the inbox's URL; the project's own account; the
  exception, or "none".

## Done when

- `git grep -F` finds none of this step's tokens outside the bootstrap's own
  files, tests and the template-build log
  (`docs/decisions/2026-10-21-template-build-decisions.md`), and
  `bd memories` shows the filled memories.
- The branch rule reads back `local/check-full` and `proof`, or an inbox
  item says what is missing and why.
- `.beads/config.yaml`'s `sync.remote` names the project's own repository
  and `bd dolt push` succeeded, or a bead says the step is left.
- The inbox page opens, and holds one item per owner-only step that applies
  now (each with its bead); or the owner declined it, a BS row says so, and
  the practice is gone as above. A trial adds one item only (`SKILL.md`,
  _Trial runs_), and the other owner-only steps as beads.
