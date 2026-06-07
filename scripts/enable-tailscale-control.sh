#!/usr/bin/env bash
# Cortex — opt in to UI-driven Tailscale control (scoped + auditable).
#
# Installs Tailscale (if absent), installs the pinned control wrapper root-owned,
# and adds a tight sudoers rule granting the Cortex web user passwordless sudo for
# ONLY the three fixed verbs (status|up|down) of that wrapper — no broad sudo. This
# is a deliberate privilege grant; only run it on a trusted LAN box.
#
# Usage:
#   sudo ./scripts/enable-tailscale-control.sh [web-user]
#
# Then set  "system": { "tailscale": true }  in cortex-config.json and restart the
# Cortex web service. Connect from the UI (Settings -> Remote access) — the first
# connect prints a login URL you visit to authenticate this node to YOUR tailnet.
#
# To revoke: rm /etc/sudoers.d/cortex-tailscale and set the flag back to false.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo ./scripts/enable-tailscale-control.sh [web-user]" >&2
  exit 1
fi

WEB_USER="${1:-${SUDO_USER:-$(whoami)}}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cortex-tailscale.sh"
DEST="/usr/local/bin/cortex-tailscale.sh"
SUDOERS="/etc/sudoers.d/cortex-tailscale"

if [ ! -f "$SRC" ]; then
  echo "Wrapper not found at $SRC" >&2
  exit 1
fi

# Install Tailscale if it isn't already present.
if ! command -v tailscale >/dev/null 2>&1; then
  echo "Installing Tailscale (tailscale.com/install.sh)..."
  curl -fsSL https://tailscale.com/install.sh | sh
fi

# Root-owned, world-readable/executable, NOT writable by the web user.
install -o root -g root -m 0755 "$SRC" "$DEST"

# Grant passwordless sudo for ONLY these three exact invocations.
{
  printf '%s ALL=(root) NOPASSWD: %s status, ' "$WEB_USER" "$DEST"
  printf '%s up, ' "$DEST"
  printf '%s down\n' "$DEST"
} > "$SUDOERS"
chmod 0440 "$SUDOERS"

# Validate before leaving it in place; remove if invalid (never break sudo).
if ! visudo -cf "$SUDOERS"; then
  rm -f "$SUDOERS"
  echo "sudoers validation failed — rule removed, nothing changed." >&2
  exit 1
fi

echo "Enabled: '${WEB_USER}' may run ${DEST} {status|up|down} via passwordless sudo (and nothing else)."
echo "Next:"
echo "  1. set  \"system\": { \"tailscale\": true }  in cortex-config.json"
echo "  2. restart the Cortex web service"
echo "  3. open Settings -> Remote access in Cortex and click Connect"
