#!/usr/bin/env bash
# Cortex — self-update: pull the latest code, reinstall deps, rebuild, then restart
# the Cortex service (detached, so the build can't be left half-applied and the
# caller's HTTP response flushes before the restart).
#
# Runs entirely as the Cortex web user — no root. Targets the standard git-checkout
# deploy (scripts/install.sh). A failed pull/build aborts BEFORE any restart, so a
# broken build never goes live.
#
# Restart is, in order of preference:
#   1. $CORTEX_RESTART_CMD            (full command you provide — any process manager)
#   2. systemd-run --user … restart $CORTEX_SERVICE   (default: cortex-web)
#   3. a plain backgrounded systemctl --user restart   (fallback)
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # repo root

echo "[cortex-self-update] at $(git rev-parse --short HEAD 2>/dev/null || echo '?') — pulling…"
git pull --ff-only

echo "[cortex-self-update] installing deps…"
pnpm install --frozen-lockfile

echo "[cortex-self-update] building…"
pnpm build

echo "[cortex-self-update] build OK at $(git rev-parse --short HEAD 2>/dev/null || echo '?') — scheduling restart"

SERVICE="${CORTEX_SERVICE:-cortex-web}"
if [ -n "${CORTEX_RESTART_CMD:-}" ]; then
  setsid sh -c "sleep 2; ${CORTEX_RESTART_CMD}" >/dev/null 2>&1 </dev/null &
elif command -v systemd-run >/dev/null 2>&1; then
  # Transient timer unit fires OUTSIDE this service's cgroup, so the restart
  # survives our own process being torn down.
  systemd-run --user --on-active=2 --collect \
    systemctl --user restart "$SERVICE" >/dev/null 2>&1 \
    || setsid sh -c "sleep 2; systemctl --user restart $SERVICE" >/dev/null 2>&1 </dev/null &
else
  setsid sh -c "sleep 2; systemctl --user restart $SERVICE" >/dev/null 2>&1 </dev/null &
fi

echo "[cortex-self-update] done — restarting shortly"
