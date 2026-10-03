#!/usr/bin/env bash
set -uo pipefail

cd /mnt/d/trading-system/apps/api || exit 1
# dist output uses modern ESM import attributes.
# Fail fast instead of waiting for API startup timeouts on old Node runtimes.
node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)

if [ "$node_major" -lt 20 ]; then
    echo "SKIP: Node.js 20+ required for compiled API; current: $(node --version 2>/dev/null || echo missing)"
    exit 77
fi

export DOTENV_CONFIG_PATH=.env.test
export NODE_ENV=test
export STOP_WORKER_ENABLED=false
export LIMIT_WORKER_ENABLED=false
export MARKET_DATA_PROVIDER=demo
unset DATABASE_URL

# Safety: require the dedicated test database.
if ! node - <<'NODE'
require("dotenv").config({ path: ".env.test" });
const url = process.env.DATABASE_URL;

if (!url || new URL(url).pathname !== "/gold_trading_test") {
  console.error("FAIL: Dedicated test database is required");
  process.exit(1);
}

console.log("PASS: Test database verified");
NODE
then
  exit 1
fi

passed=0
failed=0
child=""

# An exited child may remain visible as a zombie until wait reaps it.
process_finished() {
  local state

  if [ -z "$child" ]; then
    return 0
  fi

  if ! kill -0 "$child" 2>/dev/null; then
    return 0
  fi

  state=$(ps -p "$child" -o stat= 2>/dev/null || true)

  case "$state" in
    Z*|"") return 0 ;;
    *)     return 1 ;;
  esac
}

cleanup() {
  if [ -n "$child" ]; then
    if ! process_finished; then
      kill -TERM "$child" 2>/dev/null || true

      for ((i=0; i<50; i++)); do
        if process_finished; then
          break
        fi
        sleep 0.1
      done

      if ! process_finished; then
        kill -KILL "$child" 2>/dev/null || true
      fi
    fi

    wait "$child" 2>/dev/null || true
    child=""
  fi
}

trap cleanup EXIT

wait_for_log() {
  local pattern="$1"
  local logfile="$2"
  local timeout_seconds="$3"
  local iterations=$((timeout_seconds * 5))

  for ((i=0; i<iterations; i++)); do
    if grep -Fq "$pattern" "$logfile"; then
      return 0
    fi

    if process_finished; then
      return 1
    fi

    sleep 0.2
  done

  return 1
}

wait_for_exit() {
  local timeout_seconds="$1"
  local iterations=$((timeout_seconds * 5))

  for ((i=0; i<iterations; i++)); do
    if process_finished; then
      return 0
    fi

    sleep 0.2
  done

  return 1
}

report_failure() {
  local signal="$1"
  local reason="$2"
  local logfile="$3"

  echo "[FAIL] $signal: $reason"
  echo "=== API log ==="
  cat "$logfile"

  failed=$((failed + 1))

  cleanup
  rm -f "$logfile"
}

run_signal_test() {
  local signal="$1"
  local logfile
  local port
  local status

  logfile=$(mktemp)

  port=$(node -e '
    const net = require("node:net");
    const server = net.createServer();

    server.listen(0, "127.0.0.1", () => {
      console.log(server.address().port);
      server.close();
    });
  ')

  echo "[RUN] $signal: starting API on port $port"

  PORT="$port" node -r dotenv/config dist/main.js >"$logfile" 2>&1 &
  child=$!

  # WSL startup can take longer than 10 seconds.
  if ! wait_for_log "Trading System API running" "$logfile" 90; then
    report_failure "$signal" "API did not start within 90 seconds" "$logfile"
    return
  fi

  if ! wait_for_log "SL/TP stop worker disabled" "$logfile" 10; then
    report_failure "$signal" "Stop Worker startup state missing" "$logfile"
    return
  fi

  if ! wait_for_log "Limit worker disabled" "$logfile" 10; then
    report_failure "$signal" "Limit Worker startup state missing" "$logfile"
    return
  fi

  if process_finished; then
    report_failure "$signal" "API exited before signal" "$logfile"
    return
  fi

  echo "[RUN] $signal: startup confirmed; sending signal to PID $child"

  if ! kill -s "$signal" "$child"; then
    report_failure "$signal" "Could not send signal" "$logfile"
    return
  fi

  if ! wait_for_log "Shutdown completed" "$logfile" 30; then
    report_failure "$signal" "Shutdown did not complete within 30 seconds" "$logfile"
    return
  fi

  if ! wait_for_exit 15; then
    report_failure "$signal" "Process did not exit after shutdown" "$logfile"
    return
  fi

  wait "$child"
  status=$?
  child=""

  if grep -Fq "$signal received. Shutting down..." "$logfile" &&
     grep -Fq "PostgreSQL connection closed" "$logfile" &&
     grep -Fq "Shutdown completed" "$logfile" &&
     [ "$status" -eq 0 ]; then

    echo "[PASS] $signal: graceful shutdown completed; exit=0"
    passed=$((passed + 1))
  else
    echo "[FAIL] $signal: unexpected shutdown result; exit=$status"
    cat "$logfile"
    failed=$((failed + 1))
  fi

  rm -f "$logfile"
}

run_signal_test INT
run_signal_test TERM

echo "RESULT: passed=$passed failed=$failed"

if [ "$failed" -ne 0 ]; then
  exit 1
fi
