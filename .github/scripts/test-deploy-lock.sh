#!/usr/bin/env bash
#
# Proof that foundry-deploy-lib.sh's cross-repo deploy lock behaves the way the
# deploy depends on it behaving.
#
# WHY THIS EXISTS. The lock is now the FIRST step of the deploy job and it can
# fail the job, so a bug in it is a bug that stops deploys — and, in the other
# direction, a lock that hands two runs the same window re-opens the LevelDB
# corruption hazard the rest of the workflow exists to close (see the "cross-repo
# deploy mutex" header in foundry-deploy-lib.sh for the 2026-08-02 race that
# motivated it). Both directions are asserted here rather than assumed.
#
# Entirely offline: a temp directory stands in for the lock path, no ssh, no pm2,
# no server. Runs in the preflight job, and locally:
#   bash .github/scripts/test-deploy-lock.sh
#
set -uo pipefail

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/foundry-deploy-lib.sh"
[ -r "$LIB" ] || { echo "cannot find foundry-deploy-lib.sh next to this script"; exit 2; }
WORK="$(mktemp -d)"
LOCK="$WORK/foundry-deploy.lock"

fail=0
say()  { printf '\n=== %s ===\n' "$1"; }
expect() { # expect <wanted-rc> <actual-rc> <label>
  if [ "$2" = "$1" ]; then echo "PASS ($3: exit $2)"; else echo "FAIL ($3: wanted exit $1, got $2)"; fail=1; fi
}
assert() { # assert <condition-result> <label>
  if [ "$1" = 0 ]; then echo "PASS ($2)"; else echo "FAIL ($2)"; fail=1; fi
}

# Short timeouts: the point is the decision, not the wall clock.
run_lock()   { DEPLOY_LOCK_DIR="$LOCK" DEPLOY_LOCK_OWNER="$1" DEPLOY_LOCK_TIMEOUT="${2:-4}" \
               POLL_INTERVAL=1 bash "$LIB" lock; }
run_unlock() { DEPLOY_LOCK_DIR="$LOCK" DEPLOY_LOCK_OWNER="$1" bash "$LIB" unlock; }

say "1. an uncontended lock is acquired, and records who holds it"
out="$(run_lock repoA#1)"; rc=$?
expect 0 "$rc" "lock acquires"
printf '%s\n' "$out"
[ -d "$LOCK" ]; assert $? "the lock directory exists"
[ "$(cat "$LOCK/owner" 2>/dev/null)" = "repoA#1" ]; assert $? "owner recorded as repoA#1"
case "$(cat "$LOCK/epoch" 2>/dev/null)" in ''|*[!0-9]*) assert 1 "epoch recorded" ;; *) assert 0 "epoch recorded" ;; esac

say "2. THE POINT OF THE WHOLE FILE: a second holder is refused, not admitted"
out="$(run_lock repoB#2 3)"; rc=$?
expect 1 "$rc" "a contended lock refuses"
printf '%s\n' "$out" | grep -q 'repoA#1'; assert $? "the refusal names the current holder"
[ "$(cat "$LOCK/owner" 2>/dev/null)" = "repoA#1" ]; assert $? "the loser did not steal the lock"

say "3. the loser cannot release the winner's lock"
out="$(run_unlock repoB#2)"; rc=$?
expect 0 "$rc" "a foreign unlock is a no-op, not an error"
printf '%s\n' "$out" | grep -q '::warning::'; assert $? "and it says so"
[ -d "$LOCK" ]; assert $? "the lock survives a foreign unlock"

say "4. the holder releases it, and the next run can then take it"
run_unlock repoA#1 > /dev/null; expect 0 "$?" "the holder releases"
[ ! -d "$LOCK" ]; assert $? "the lock directory is gone"
run_lock repoC#3 > /dev/null; expect 0 "$?" "the next run acquires"
run_unlock repoC#3 > /dev/null
run_unlock repoC#3 > /dev/null; expect 0 "$?" "releasing an unheld lock is a no-op"

say "5. a lock left behind by a dead run expires instead of blocking forever"
# A cancelled GitHub job cannot run its release step, so without this the next
# deploy of either repo would be stuck until someone ssh'd in.
mkdir -p "$LOCK"; echo "repoZ#cancelled" > "$LOCK/owner"
echo $(( $(date +%s) - 4000 )) > "$LOCK/epoch"      # older than DEPLOY_LOCK_STALE=1800
out="$(run_lock repoA#4)"; rc=$?
expect 0 "$rc" "a stale lock is broken and taken"
printf '%s\n' "$out" | grep -q '::warning::breaking'; assert $? "breaking it is announced, not silent"
[ "$(cat "$LOCK/owner" 2>/dev/null)" = "repoA#4" ]; assert $? "the new owner is recorded"
run_unlock repoA#4 > /dev/null

say "6. a FRESH lock is never mistaken for a stale one"
# The dangerous inverse of case 5. A lock whose age cannot be determined must be
# assumed live: breaking a live one hands two deploys the same window.
mkdir -p "$LOCK"; echo "repoZ#live" > "$LOCK/owner"   # no epoch file at all
out="$(run_lock repoA#5 3)"; rc=$?
expect 1 "$rc" "an age-unknown lock is respected"
printf '%s\n' "$out" | grep -q '::warning::breaking'; assert $((1-$?)) "it was NOT broken"
[ "$(cat "$LOCK/owner" 2>/dev/null)" = "repoZ#live" ]; assert $? "the live holder kept the lock"
rm -rf "$LOCK"

say "7. an UNUSABLE lock path warns and continues — it does not block the deploy"
# Degrading to the pre-lock behaviour is correct; refusing to deploy because a
# lock could not be created (bad path, read-only mount, wrong owner) is not.
out="$(DEPLOY_LOCK_DIR=/proc/definitely-not-writable/deploy.lock DEPLOY_LOCK_OWNER=repoA#6 \
       DEPLOY_LOCK_TIMEOUT=3 POLL_INTERVAL=1 bash "$LIB" lock)"; rc=$?
expect 0 "$rc" "an uncreatable lock does not fail the deploy"
printf '%s\n' "$out" | grep -q '::warning::'; assert $? "but it warns that the mutex is not in effect"

rm -rf "$WORK"
echo
if [ "$fail" = 0 ]; then
  echo "ALL DEPLOY-LOCK ASSERTIONS PASSED"
  exit 0
fi
echo "DEPLOY-LOCK ASSERTIONS FAILED"
exit 1
