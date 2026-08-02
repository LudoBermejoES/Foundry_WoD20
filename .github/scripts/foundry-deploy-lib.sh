#!/usr/bin/env bash
#
# Foundry process-control helper for the `worldofdarkness` SYSTEM deploy.
#
# ===========================================================================
# THIS FILE IS A COPY. READ THIS BEFORE EDITING IT.
# ===========================================================================
# It is a copy of wod20-compendium-es/.github/scripts/foundry-deploy-lib.sh.
# GitHub Actions cannot share a script across repositories, and these two repos
# are separate git submodules of mago20 with separate CI, so a copy is the only
# way to give this deploy the same stop/verify/start sequence.
#
# CONSEQUENCE, STATED PLAINLY: a fix to one copy does NOT reach the other. The
# process-control half (load_pm2, foundry_pids, port_listening, status_ok,
# is_down, is_up, cmd_state, cmd_stop, cmd_assert_down, cmd_start,
# cmd_assert_up, cmd_stale_handles) is intended to stay IDENTICAL in both, so
# that `diff` between them is meaningful. If you change any of it here, change
# it there too. The deliberate differences are listed at the bottom of this
# header.
#
# ---------------------------------------------------------------------------
# WHY THE SYSTEM DEPLOY NEEDS THIS AT ALL
# ---------------------------------------------------------------------------
# It was previously assumed that a Foundry SYSTEM is "plain JS that Foundry
# re-reads on a restart" and therefore safe to rsync under a live server. That
# is false for this repo: it ships 33 compiled LevelDB pack directories under
# packs/ (*.ldb, *.log, CURRENT, MANIFEST-*), and the deploy rsyncs them with
# --delete on every push to main.
#
# rsync --delete replaces those files by unlinking and recreating them. A
# Foundry process holding a pack open keeps its file descriptors pointing at the
# now DELETED inodes: its writes go to an unlinked inode, its reads return the
# pre-deploy tree, and on the next open LevelDB may run RepairDB, which discards
# the data and keeps the metadata. It never surfaces as an error — it presents as
# "compendium search returns nothing", and only a PROCESS RESTART recovers it (a
# GM world reload does not). That is how all 86 packs of wod20-compendium-es were
# destroyed on 2026-07-27.
#
# On a SYSTEM the blast radius is larger than on a module: the system supplies
# the data models and sheets for every actor in every world on the server.
#
# Measured on the live server 2026-07-30, before this change:
#   * every one of the 32 non-empty pack dirs carried a LevelDB generation NEWER
#     than the committed one (e.g. packs/lunarshapeshifting: server
#     MANIFEST-001258 + 001259.log, this repo MANIFEST-001226 + 001227.log), i.e.
#     the live process has reopened and rewritten them since the last deploy;
#   * the live Foundry (pid 2041202) held 128 open descriptors inside
#     .../systems/worldofdarkness/packs — exactly four per non-empty pack: the
#     current *.log, LOCK, LOG and MANIFEST-*.
#   An rsync --delete at that moment unlinks all 128 of those files, and rewinds
#   each CURRENT to name an older MANIFEST than the one the process is using.
#   Also: LOCK is NOT tracked in git here, so --delete unlinks the running
#   database's own lock file.
#
# So "stop Foundry first" cannot be an operator habit: the trigger is a `git
# push` and the consequence is invisible until someone searches a compendium.
# The ordering has to live in the deploy itself.
#
# The gate is MEASURED, NOT ASSUMED: pm2 reporting a successful `stop` is not
# accepted as proof (it has been wrong in this project before). Proof is the
# absence of the node process AND the absence of a listener on the Foundry port.
#
# ---------------------------------------------------------------------------
# HOW IT IS RUN
# ---------------------------------------------------------------------------
#   on the Foundry server:  ssh <host> 'bash -s -- <subcommand>' < this-file
#   locally, read-only:     bash .github/scripts/foundry-deploy-lib.sh state
#
# Piping over stdin (rather than `ssh host "bash -c '...'"`) is deliberate: the
# remote shell's own command line is then just `bash -s`, so `pgrep -f` matching
# the Foundry entry-script path cannot match the checking shell itself. ($$ and
# $PPID are filtered too, as belt and braces.)
#
# Subcommands:
#   state          print process/port/HTTP/pm2 state (diagnostics, never fails)
#   stop           pm2 stop, then poll until VERIFIED down; non-zero if it is not
#   assert-down    one-shot "is it down?" gate; non-zero if anything is up
#   start          pm2 start, then poll until VERIFIED up; non-zero if it is not
#   assert-up      one-shot "is it up?" check
#   lock           take the CROSS-REPO deploy mutex (see its section below)
#   unlock         release it, if and only if this caller still holds it
#   stale-handles  count deleted-inode fds Foundry holds inside FOUNDRY_DIR;
#                  non-zero if any exist (the direct corruption signature)
#   status-json    print the raw /api/status body (parsed by the caller)
#   version DIR    print system_version= from DIR/system.json
#
# DELIBERATE DIFFERENCES FROM THE wod20-compendium-es COPY:
#   * FOUNDRY_DIR (default: the systems/worldofdarkness dir) replaces MODULE_DIR.
#   * `lock`/`unlock` are NEW HERE (2026-08-02) and are the half of a cross-repo
#     mutex that this repo can add on its own. They are meant to be copied into
#     the wod20-compendium-es library VERBATIM, with the same DEPLOY_LOCK_DIR —
#     until that happens the two deploys can still interleave, which is the
#     failure recorded in that section's header.
#   * `hash DIR` is absent: this repo's deploy.yml compares per-file sha256
#     manifests of the whole tree, so a second hashing implementation here would
#     be dead code that could silently disagree with the one in use.
#   * `version DIR` reads system.json, not module.json.
#   * `status-json` is new (deploy.yml checks that the restarted Foundry reports
#     the system version that was just pushed).
#
set -uo pipefail

FOUNDRY_PM2_NAME="${FOUNDRY_PM2_NAME:-foundryvtt}"
# ERE, matched against the full command line. Measured on the server 2026-07-30:
#   www-data  2041202  node /var/www/foundryvtt/resources/app/main.js
FOUNDRY_SCRIPT_RE="${FOUNDRY_SCRIPT_RE:-/var/www/foundryvtt/resources/app/main\.js}"
FOUNDRY_PORT="${FOUNDRY_PORT:-30000}"
# Foundry on this host serves TLS on 30000 (plain http gives "Empty reply from
# server"), and /api/status returns e.g.
#   {"active":true,"version":"14.365","world":"berlin-tenebroso",
#    "system":"worldofdarkness","systemVersion":"7.5.4","users":1,...}
FOUNDRY_STATUS_URL="${FOUNDRY_STATUS_URL:-https://127.0.0.1:30000/api/status}"
FOUNDRY_DIR="${FOUNDRY_DIR:-/var/www/foundrydata/Data/systems/worldofdarkness}"
DOWN_TIMEOUT="${DOWN_TIMEOUT:-90}"
UP_TIMEOUT="${UP_TIMEOUT:-180}"
POLL_INTERVAL="${POLL_INTERVAL:-2}"

PM2=""

# ---------------------------------------------------------------------------
# primitives
# ---------------------------------------------------------------------------

load_pm2() {
  [ -n "$PM2" ] && return 0
  if command -v pm2 >/dev/null 2>&1; then PM2="$(command -v pm2)"; return 0; fi
  # A non-interactive ssh does not get the nvm PATH, and pm2 lives under nvm on
  # this host (measured: /var/www/.nvm/versions/node/v25.6.0/bin/pm2). Source
  # nvm, then fall back to globbing, so a node version bump cannot silently
  # break the deploy.
  export NVM_DIR="${NVM_DIR:-/var/www/.nvm}"
  # shellcheck disable=SC1090,SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
  if command -v pm2 >/dev/null 2>&1; then PM2="$(command -v pm2)"; return 0; fi
  local p
  for p in "$NVM_DIR"/versions/node/*/bin/pm2; do
    if [ -x "$p" ]; then PM2="$p"; return 0; fi
  done
  return 1
}

# Every pid whose command line is the Foundry entry script, minus this shell and
# its parent (which can never match anyway when piped over stdin, but see above).
foundry_pids() {
  pgrep -f -- "$FOUNDRY_SCRIPT_RE" 2>/dev/null | while read -r pid; do
    [ "$pid" = "$$" ] && continue
    [ "$pid" = "$PPID" ] && continue
    printf '%s\n' "$pid"
  done
}

port_listening() {
  ss -H -ltn "sport = :$FOUNDRY_PORT" 2>/dev/null | grep -q .
}

# Serving, not merely bound. Used only for the "is it back up?" direction.
status_ok() {
  local body
  body="$(curl -sSk --max-time 10 "$FOUNDRY_STATUS_URL" 2>/dev/null)" || return 1
  printf '%s' "$body" | grep -q '"version"'
}

# DOWN means: no Foundry process AND nothing listening on the port. Both, because
# either one alone can lie — a process can linger after the socket closes, and a
# socket can outlive (or be inherited from) a process. pm2's own exit code is not
# part of this decision at all.
is_down() {
  [ -z "$(foundry_pids)" ] && ! port_listening
}

is_up() {
  [ -n "$(foundry_pids)" ] && port_listening
}

cmd_state() {
  echo "host=$(hostname) user=$(id -un) date=$(date -Is 2>/dev/null || date)"
  local pids
  pids="$(foundry_pids | tr '\n' ' ')"
  echo "foundry_pids=${pids:-<none>}"
  pgrep -a -f -- "$FOUNDRY_SCRIPT_RE" 2>/dev/null | sed 's/^/  ps: /' || true
  if port_listening; then
    echo "port_${FOUNDRY_PORT}=LISTENING"
    ss -H -ltnp "sport = :$FOUNDRY_PORT" 2>/dev/null | sed 's/^/  ss: /' || true
  else
    echo "port_${FOUNDRY_PORT}=free"
  fi
  if status_ok; then
    echo "http_status=serving ($(curl -sSk --max-time 10 "$FOUNDRY_STATUS_URL" 2>/dev/null | head -c 120))"
  else
    echo "http_status=not-serving"
  fi
  if load_pm2; then
    "$PM2" list 2>/dev/null | grep -E "id|$FOUNDRY_PM2_NAME" | sed 's/^/  pm2: /' || true
  else
    echo "  pm2: NOT FOUND"
  fi
}

# ---------------------------------------------------------------------------
# stop / start
# ---------------------------------------------------------------------------

cmd_stop() {
  echo "--- state before stop ---"
  cmd_state
  echo

  if is_down; then
    echo "Foundry was ALREADY down before this deploy (nothing to stop)."
    echo "foundry_was_running=false"
  else
    echo "foundry_was_running=true"
    if ! load_pm2; then
      echo "::error::pm2 not found on the server — refusing to rsync into a live Foundry."
      exit 1
    fi
    echo "Running: $PM2 stop $FOUNDRY_PM2_NAME"
    # The exit code here is INFORMATIONAL ONLY. It is recorded and then ignored;
    # the loop below is what decides. (A pm2 stop that returned 0 while Foundry
    # kept running is the precise way this project has been bitten.)
    "$PM2" stop "$FOUNDRY_PM2_NAME"
    echo "pm2_stop_exit=$? (not trusted — verifying against ps and the port)"
  fi

  local waited=0
  while ! is_down; do
    if [ "$waited" -ge "$DOWN_TIMEOUT" ]; then
      echo
      echo "::error::Could NOT verify Foundry is down after ${DOWN_TIMEOUT}s. Refusing to deploy."
      echo "::error::rsync --delete into a live LevelDB pack tree corrupts it silently; a failed deploy is better."
      echo "--- state at give-up ---"
      cmd_state
      exit 1
    fi
    sleep "$POLL_INTERVAL"
    waited=$((waited + POLL_INTERVAL))
  done

  echo
  echo "VERIFIED DOWN after ${waited}s: no process matching the Foundry entry script,"
  echo "and nothing listening on port ${FOUNDRY_PORT}."
  cmd_state
}

cmd_assert_down() {
  if is_down; then
    echo "assert-down OK: no Foundry process, port ${FOUNDRY_PORT} free."
    return 0
  fi
  echo "::error::Foundry is UP at the moment of the transfer — aborting before writing a single byte."
  cmd_state
  return 1
}

cmd_start() {
  if ! load_pm2; then
    echo "::error::pm2 not found — CANNOT BRING FOUNDRY BACK UP. Foundry is DOWN and needs manual attention:"
    echo "::error::  ssh <server> && export NVM_DIR=/var/www/.nvm && . \$NVM_DIR/nvm.sh && pm2 start $FOUNDRY_PM2_NAME"
    exit 1
  fi
  if is_up; then
    echo "Foundry is already up."
  else
    echo "Running: $PM2 start $FOUNDRY_PM2_NAME"
    "$PM2" start "$FOUNDRY_PM2_NAME" || "$PM2" restart "$FOUNDRY_PM2_NAME" || true
  fi

  local waited=0
  while true; do
    if is_up && status_ok; then
      echo "VERIFIED UP after ${waited}s: process present, port ${FOUNDRY_PORT} listening, /api/status serving."
      cmd_state
      return 0
    fi
    if [ "$waited" -ge "$UP_TIMEOUT" ]; then
      echo
      echo "::error::################################################################"
      echo "::error::FOUNDRY DID NOT COME BACK UP within ${UP_TIMEOUT}s. IT IS DOWN NOW."
      echo "::error::Manual recovery: pm2 start $FOUNDRY_PM2_NAME  (logs: pm2 logs $FOUNDRY_PM2_NAME)"
      echo "::error::################################################################"
      echo "--- state at give-up ---"
      cmd_state
      echo "--- last pm2 log lines ---"
      "$PM2" logs "$FOUNDRY_PM2_NAME" --lines 40 --nostream 2>/dev/null || true
      exit 1
    fi
    sleep "$POLL_INTERVAL"
    waited=$((waited + POLL_INTERVAL))
  done
}

cmd_assert_up() {
  if is_up && status_ok; then
    echo "assert-up OK: process present, port listening, /api/status serving."
    return 0
  fi
  echo "::error::Foundry is NOT serving."
  cmd_state
  return 1
}

# ---------------------------------------------------------------------------
# cross-repo deploy mutex
# ---------------------------------------------------------------------------
# WHY THIS EXISTS (measured, 2026-08-02).
#
# Three repos rsync into the same Foundry data directory and two of them stop and
# start the same pm2 process. GitHub `concurrency:` groups are PER-REPOSITORY, so
# they cannot serialise against each other, and the previous mitigation was a
# comment in deploy.yml saying "do not push those at the same time as this one".
# That is not a mechanism, and a `regen.py` fan-out commits the entity data and
# the system in the same breath, so pushing both together is the NORMAL case.
#
# It happened. Foundry_WoD20 run 30753691518 and wod20-compendium-es run
# 30753690312 overlapped:
#   15:09:34  compendium deploy: pm2 stop foundryvtt (foundry_was_running=true)
#   15:09:43  system deploy: stop gate sees foundry_was_running=false, VERIFIED DOWN
#   15:09:45  compendium deploy: pm2 restart foundryvtt  <-- inside our window
#   15:09:46  system deploy: assert-down OK, rsync starts
#   15:09:48  system deploy: rsync --delete unlinks LOCK/MANIFEST-*/*.log in 32
#             system packs WHILE Foundry is booting and opening them
#   15:09:52  system deploy: audit finds a LOCK in every pack and CURRENT /
#             MANIFEST-* / *.log advanced by exactly +2. Byte verification FAILS.
# Both of that deploy's "is it down?" gates were TRUE when they ran. Neither could
# see two seconds into the future.
#
# That is the exact rsync-into-a-live-LevelDB scenario the rest of this file
# exists to prevent, arriving from another repository. So the lock is the fix and
# the byte comparison is the detector; do not "fix" the detector by excluding the
# files that move.
#
# MECHANISM: an atomically-created lock DIRECTORY (mkdir is atomic on POSIX)
# outside every deploy target, so no rsync --delete can remove it. Held across
# stop -> rsync -> verify -> start.
#
# BOTH HALVES EXIST as of 2026-08-02: `wod20-compendium-es@b787d5ec` carries the
# same `lock`/`unlock`, verified byte-identical across the 62 executable lines,
# with the SAME DEPLOY_LOCK_DIR and the same 1800s staleness. That equality is
# the whole mechanism — two locks with different paths or different expiries
# would each acquire happily and reproduce the very race this exists to stop,
# while looking protected. Its test suite pins both constants by literal for
# exactly that reason, because neither repo's CI can see the other's checkout.
#
# The race this prevents is not hypothetical. On 2026-08-02 the compendium
# stopped Foundry at 15:09:34; this deploy read `foundry_was_running=false` at
# :43 and asserted VERIFIED DOWN — true, and true only because the sibling had
# stopped it; the compendium restarted it at :45.95, and this side's
# `rsync --delete` then unlinked LOCK/MANIFEST-*/*.log across 32 packs while
# Foundry was booting and opening them. The byte audit caught it. Neither gate
# was wrong; neither could see two seconds ahead.
#
# FAILING TO CREATE THE LOCK IS NOT A DEPLOY FAILURE. If the path is not
# writable, cmd_lock warns and returns 0: degrading to the previous behaviour is
# correct, blocking every deploy on a lock that cannot exist is not.
DEPLOY_LOCK_DIR="${DEPLOY_LOCK_DIR:-/var/www/foundrydata/.foundry-deploy.lock}"
DEPLOY_LOCK_TIMEOUT="${DEPLOY_LOCK_TIMEOUT:-600}"
# Older than this and the holder is assumed dead (a cancelled job cannot run its
# release step). A whole deploy of either repo is ~50s, so 30 min is 30x slack.
DEPLOY_LOCK_STALE="${DEPLOY_LOCK_STALE:-1800}"
DEPLOY_LOCK_OWNER="${DEPLOY_LOCK_OWNER:-unidentified-caller}"

lock_holder() {
  cat "$DEPLOY_LOCK_DIR/owner" 2>/dev/null
}

# Seconds the current lock has been held. An unreadable/absent epoch falls back
# to the directory's own mtime (set by mkdir), and an unreadable mtime yields 0 —
# i.e. "assume FRESH". Never guess that an unknown lock is stale: breaking a live
# one re-opens the very race this lock closes.
lock_age() {
  local since now
  since="$(cat "$DEPLOY_LOCK_DIR/epoch" 2>/dev/null)"
  case "${since:-}" in ''|*[!0-9]*) since="$(stat -c %Y "$DEPLOY_LOCK_DIR" 2>/dev/null)" ;; esac
  case "${since:-}" in ''|*[!0-9]*) echo 0; return 0 ;; esac
  now="$(date +%s)"
  echo $(( now - since ))
}

cmd_lock() {
  local waited=0 age broke=0 announced=0
  while ! mkdir "$DEPLOY_LOCK_DIR" 2>/dev/null; do
    # mkdir can fail for reasons that are not contention (no such parent, read-only
    # mount, wrong owner). Those must not stall a deploy that used to work.
    if [ ! -d "$DEPLOY_LOCK_DIR" ]; then
      echo "::warning::cannot create the deploy lock at $DEPLOY_LOCK_DIR (not a contention failure)."
      echo "::warning::continuing WITHOUT the cross-repo mutex — a concurrent deploy of another repo can still interleave."
      return 0
    fi
    age="$(lock_age)"
    if [ "$broke" = 0 ] && [ "$age" -gt "$DEPLOY_LOCK_STALE" ]; then
      echo "::warning::breaking a deploy lock held for ${age}s (> ${DEPLOY_LOCK_STALE}s) by: $(lock_holder)"
      broke=1
      rm -rf "$DEPLOY_LOCK_DIR" 2>/dev/null || true
      continue
    fi
    if [ "$waited" -ge "$DEPLOY_LOCK_TIMEOUT" ]; then
      echo "::error::another Foundry deploy has held $DEPLOY_LOCK_DIR for ${age}s: $(lock_holder)"
      echo "::error::refusing to stop Foundry and rsync into the same server underneath it."
      echo "::error::Wait for that run to finish and re-run this one."
      return 1
    fi
    if [ "$announced" = 0 ]; then
      echo "waiting up to ${DEPLOY_LOCK_TIMEOUT}s for the Foundry deploy lock, held by: $(lock_holder)"
      announced=1
    fi
    sleep "$POLL_INTERVAL"
    waited=$((waited + POLL_INTERVAL))
  done
  printf '%s\n' "$DEPLOY_LOCK_OWNER" > "$DEPLOY_LOCK_DIR/owner" 2>/dev/null
  date +%s > "$DEPLOY_LOCK_DIR/epoch" 2>/dev/null
  echo "deploy lock ACQUIRED after ${waited}s by $DEPLOY_LOCK_OWNER ($DEPLOY_LOCK_DIR)"
}

cmd_unlock() {
  if [ ! -d "$DEPLOY_LOCK_DIR" ]; then
    echo "deploy lock $DEPLOY_LOCK_DIR is not held; nothing to release."
    return 0
  fi
  local holder
  holder="$(lock_holder)"
  # If our lock was broken as stale and re-taken, the holder is someone else's
  # live deploy. Removing it would hand two runs the same window.
  if [ -n "$holder" ] && [ "$holder" != "$DEPLOY_LOCK_OWNER" ]; then
    echo "::warning::the deploy lock is held by '$holder', not by '$DEPLOY_LOCK_OWNER' — leaving it in place."
    return 0
  fi
  rm -rf "$DEPLOY_LOCK_DIR" 2>/dev/null \
    && echo "deploy lock RELEASED by $DEPLOY_LOCK_OWNER" \
    || echo "::warning::could not remove $DEPLOY_LOCK_DIR; it will expire after ${DEPLOY_LOCK_STALE}s"
}

# ---------------------------------------------------------------------------
# verification
# ---------------------------------------------------------------------------

# The corruption signature, measured directly. After a stop -> rsync -> start
# there must be ZERO of these. Measured 2026-07-30 on this server: with the
# system deploy still unguarded, the live Foundry held 128 descriptors inside
# packs/ — every one of which an rsync --delete would have unlinked.
cmd_stale_handles() {
  local pid fd target count=0 pids
  pids="$(foundry_pids)"
  if [ -z "$pids" ]; then
    echo "::error::no Foundry process — cannot check for stale handles"
    return 1
  fi
  for pid in $pids; do
    if [ ! -r "/proc/$pid/fd" ]; then
      echo "::warning::/proc/$pid/fd is not readable — stale-handle check inconclusive for pid $pid"
      continue
    fi
    for fd in /proc/"$pid"/fd/*; do
      target="$(readlink "$fd" 2>/dev/null)" || continue
      case "$target" in
        "$FOUNDRY_DIR"*"(deleted)")
          count=$((count + 1))
          [ "$count" -le 10 ] && echo "  stale: pid $pid -> $target"
          ;;
      esac
    done
  done
  echo "stale_deleted_handles=$count"
  if [ "$count" -gt 0 ]; then
    echo "::error::Foundry holds $count file handles to DELETED files inside $FOUNDRY_DIR."
    echo "::error::That is the corruption signature this deploy exists to prevent: the packs were"
    echo "::error::rewritten under a live process. Restart Foundry (pm2 restart $FOUNDRY_PM2_NAME)."
    return 1
  fi
  echo "No stale handles: every pack file Foundry has open is a file that still exists on disk."
}

cmd_status_json() {
  curl -sSk --max-time 10 "$FOUNDRY_STATUS_URL" 2>/dev/null
}

cmd_version() {
  local dir="${1:?version needs a directory}"
  python3 -c 'import json,sys; print("system_version=" + json.load(open(sys.argv[1]))["version"])' \
    "$dir/system.json"
}

# ---------------------------------------------------------------------------

case "${1:-}" in
  state)         cmd_state ;;
  stop)          cmd_stop ;;
  assert-down)   cmd_assert_down ;;
  start)         cmd_start ;;
  assert-up)     cmd_assert_up ;;
  lock)          cmd_lock ;;
  unlock)        cmd_unlock ;;
  stale-handles) cmd_stale_handles ;;
  status-json)   cmd_status_json ;;
  version)       cmd_version "${2:-.}" ;;
  *)
    echo "usage: $0 {state|stop|assert-down|start|assert-up|lock|unlock|stale-handles|status-json|version DIR}" >&2
    exit 2
    ;;
esac
