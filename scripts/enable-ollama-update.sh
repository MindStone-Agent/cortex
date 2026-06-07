#!/usr/bin/env bash
# Cortex — opt in to UI-driven Ollama updates (scoped + auditable).
#
# Installs the pinned update wrapper root-owned and adds a tight sudoers rule
# granting the Cortex web user passwordless sudo for ONLY that wrapper (no broad
# sudo). This is a deliberate privilege grant — only run it on a trusted LAN box.
#
# Usage:
#   sudo ./scripts/enable-ollama-update.sh [web-user]
#
# Then set  "system": { "ollamaUpdate": true }  in cortex-config.json and restart
# the Cortex web service. To revoke: rm /etc/sudoers.d/cortex-ollama-update and
# set the flag back to false.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo ./scripts/enable-ollama-update.sh [web-user]" >&2
  exit 1
fi

WEB_USER="${1:-${SUDO_USER:-$(whoami)}}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cortex-ollama-update.sh"
DEST="/usr/local/bin/cortex-ollama-update.sh"
SUDOERS="/etc/sudoers.d/cortex-ollama-update"

if [ ! -f "$SRC" ]; then
  echo "Wrapper not found at $SRC" >&2
  exit 1
fi

# Root-owned, world-readable/executable, NOT writable by the web user.
install -o root -g root -m 0755 "$SRC" "$DEST"

# Grant passwordless sudo for ONLY this exact path.
printf '%s ALL=(root) NOPASSWD: %s\n' "$WEB_USER" "$DEST" > "$SUDOERS"
chmod 0440 "$SUDOERS"

# Validate before leaving it in place; remove if invalid (never break sudo).
if ! visudo -cf "$SUDOERS"; then
  rm -f "$SUDOERS"
  echo "sudoers validation failed — rule removed, nothing changed." >&2
  exit 1
fi

echo "Enabled: '${WEB_USER}' may run ${DEST} via passwordless sudo (and nothing else)."
echo "Next:"
echo "  1. set  \"system\": { \"ollamaUpdate\": true }  in cortex-config.json"
echo "  2. restart the Cortex web service"
