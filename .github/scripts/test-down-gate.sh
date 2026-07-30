#!/usr/bin/env bash
#
# Proof that foundry-deploy-lib.sh's "verified down" gate cannot be fooled by pm2
# reporting success.
#
# This is the one gate whose silent failure causes data loss: if `stop` returns 0
# while Foundry is still running, the deploy rsyncs --delete into 33 live LevelDB
# pack directories and can trigger RepairDB, which discards the data and keeps the
# metadata. Nothing downstream would notice. So the gate's refusal is asserted
# here rather than assumed.
#
# The fake `pm2` ALWAYS exits 0 and never kills anything — exactly the way this
# project has been bitten. The fake `ss` reports a listener on demand. Both are
# put ahead of the real ones on PATH; no real process and no server is involved.
#
# Runs offline in the preflight job, and locally:
#   bash .github/scripts/test-down-gate.sh
#
set -uo pipefail

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/foundry-deploy-lib.sh"
[ -r "$LIB" ] || { echo "cannot find foundry-deploy-lib.sh next to this script"; exit 2; }
WORK="$(mktemp -d)"
BIN="$WORK/bin"
mkdir -p "$BIN"
FAKE_PATH="/var/www/foundryvtt/resources/app/main.js"

cat > "$BIN/pm2" <<'EOF'
#!/bin/sh
# The liar: claims success, kills nothing.
echo "[fake pm2] $* -> pretending success"
exit 0
EOF

cat > "$BIN/ss" <<'EOF'
#!/bin/sh
# Reports a listener iff $WORK/port_listening exists.
if [ -f "$FAKE_STATE/port_listening" ]; then
  echo 'LISTEN 0      511    *:30000 *:*'
fi
exit 0
EOF
chmod +x "$BIN/pm2" "$BIN/ss"

export FAKE_STATE="$WORK"
export PATH="$BIN:$PATH"
export DOWN_TIMEOUT=6 POLL_INTERVAL=2
unset FOUNDRY_SCRIPT_RE   # use the lib's own default, i.e. the real regex

fail=0
say() { printf '\n=== %s ===\n' "$1"; }
expect() { # expect <wanted-rc> <actual-rc> <label>
  if [ "$2" = "$1" ]; then echo "PASS ($3: exit $2)"; else echo "FAIL ($3: wanted exit $1, got $2)"; fail=1; fi
}

start_fake_foundry() {
  /bin/sh -c 'while :; do sleep 1; done' "$FAKE_PATH" &
  FAKE_PID=$!
  # prove pgrep can see it the way the lib does
  sleep 0.5
  pgrep -f -- "/var/www/foundryvtt/resources/app/main\.js" | grep -q "$FAKE_PID" \
    || { echo "HARNESS BROKEN: pgrep cannot see the fake process $FAKE_PID"; exit 99; }
  echo "fake Foundry running as pid $FAKE_PID"
}
stop_fake_foundry() { kill "$FAKE_PID" 2>/dev/null; wait "$FAKE_PID" 2>/dev/null; }

# ---------------------------------------------------------------------------
say "1. pm2 exits 0 but the process is STILL ALIVE and the port STILL LISTENING"
start_fake_foundry
touch "$WORK/port_listening"
t0=$SECONDS
bash "$LIB" stop > "$WORK/out1.txt" 2>&1; rc=$?
elapsed=$((SECONDS - t0))
expect 1 "$rc" "stop refuses"
grep -q 'pm2_stop_exit=0' "$WORK/out1.txt" && echo "PASS (pm2 reported exit 0 and it was recorded)"
grep -q 'not trusted' "$WORK/out1.txt" && echo "PASS (pm2 exit explicitly marked untrusted)"
grep -q 'Could NOT verify Foundry is down' "$WORK/out1.txt" && echo "PASS (refusal message present)"
if [ "$elapsed" -ge "$DOWN_TIMEOUT" ]; then
  echo "PASS (poll loop really slept: ${elapsed}s >= DOWN_TIMEOUT=${DOWN_TIMEOUT}s -- not a spin)"
else
  echo "FAIL (loop returned in ${elapsed}s, less than DOWN_TIMEOUT=${DOWN_TIMEOUT}s: it did not wait)"; fail=1
fi

say "2. same, via assert-down (the pre-rsync re-assertion)"
bash "$LIB" assert-down > "$WORK/out2.txt" 2>&1; rc=$?
expect 1 "$rc" "assert-down refuses"
grep -q 'aborting before writing a single byte' "$WORK/out2.txt" && echo "PASS (abort message present)"

say "3. process GONE but port still listening -> must still refuse (both facts required)"
stop_fake_foundry
bash "$LIB" assert-down > "$WORK/out3.txt" 2>&1; rc=$?
expect 1 "$rc" "assert-down refuses on port alone"

say "4. port free but process ALIVE -> must still refuse (both facts required)"
rm -f "$WORK/port_listening"
start_fake_foundry
bash "$LIB" assert-down > "$WORK/out4.txt" 2>&1; rc=$?
expect 1 "$rc" "assert-down refuses on process alone"

say "5. positive control: nothing alive, port free -> gate passes"
stop_fake_foundry
bash "$LIB" assert-down > "$WORK/out5.txt" 2>&1; rc=$?
expect 0 "$rc" "assert-down accepts a genuinely down Foundry"
bash "$LIB" stop > "$WORK/out6.txt" 2>&1; rc=$?
expect 0 "$rc" "stop accepts a genuinely down Foundry"
grep -q 'ALREADY down' "$WORK/out6.txt" && echo "PASS (recognised as already down; pm2 never invoked)"
grep -q 'pm2_stop_exit' "$WORK/out6.txt" && { echo "FAIL (pm2 was invoked on an already-down server)"; fail=1; }

say "6. the liar cannot be rescued by a slow death either: process dies mid-poll"
touch "$WORK/port_listening"
start_fake_foundry
( sleep 3; kill "$FAKE_PID" 2>/dev/null; rm -f "$WORK/port_listening" ) &
t0=$SECONDS
DOWN_TIMEOUT=20 bash "$LIB" stop > "$WORK/out7.txt" 2>&1; rc=$?
elapsed=$((SECONDS - t0))
expect 0 "$rc" "stop succeeds once BOTH facts really report down (after ${elapsed}s)"
grep -q 'VERIFIED DOWN' "$WORK/out7.txt" && echo "PASS (declared down only after measuring it)"

echo
if [ "$fail" = 0 ]; then echo "ALL DOWN-GATE ASSERTIONS PASSED"; else echo "DOWN-GATE TEST FAILURES"; fi
echo "logs: $WORK"
exit "$fail"
