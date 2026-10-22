#!/usr/bin/env bash
# Did `pnpm check:full` pass on this PR's head? (CI decisions CI9, CI17.) It
# posts a commit status, `local/check-full`, once the commit is on GitHub
# (tools/local-check). ci.yml's `proof` job runs this first; without the
# proof the job fails, and `pnpm check:full` posts it and re-runs that job.
#
# Waits up to WAIT_SECONDS (90) for the proof: the pre-push hook posts it in
# the background once the push lands, which can be a few seconds after this
# run starts.
#
# On success it writes the proof's description to $GITHUB_OUTPUT as
# `description`: its first words name the e2e projects that ran on each build
# and the Node major, which the job's step "Proof covers the change" reads.
#
# Needs GH_TOKEN with statuses: read, REPO and SHA.
set -euo pipefail

: "${REPO:?}" "${SHA:?}"
wait_seconds=${WAIT_SECONDS:-90}

# An API error reads as "no proof yet", never as a failure of its own: the
# loop asks again, and only a missing proof fails the job.
deadline=$((SECONDS + wait_seconds))
while :; do
  # "<state><tab><description>" of the newest local/check-full status.
  status=$(gh api "repos/$REPO/commits/$SHA/status" \
    --jq '[.statuses[] | select(.context == "local/check-full")][0] | "\(.state // "")\t\(.description // "")"' \
    2>/dev/null || true)
  state=${status%%$'\t'*}
  if [ "$state" = success ]; then
    # One line, and nothing a later step reads but the description itself.
    description=$(printf '%s' "${status#*$'\t'}" | head -n 1 | tr -d '\r')
    echo "pnpm check:full passed on $SHA: $description"
    if [ -n "${GITHUB_OUTPUT:-}" ]; then
      printf 'description=%s\n' "$description" >> "$GITHUB_OUTPUT"
    fi
    exit 0
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then break; fi
  sleep 10
done

echo "::error::No proof that pnpm check:full passed on $SHA. Run 'pnpm check:full' on that commit" \
  "(Node 24, a clean worktree): it posts the proof and re-runs this job. A Dependabot PR: check it out" \
  "and run it there (tools/local-check/CLAUDE.md)."
exit 1
