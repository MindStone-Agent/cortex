#!/usr/bin/env bash
# Cortex — opt in to UI-driven Ollama settings (cloud API key, default context
# length, default keep-alive). Scoped + auditable.
#
# Sets up three things:
#   1. A root-owned NO-ARG restart wrapper + a tight sudoers rule. The Cortex web
#      user may run ONLY that wrapper via passwordless sudo (no broad sudo, and
#      nothing user-controlled reaches root — root only restarts the service).
#   2. A Cortex-managed env file (/etc/cortex/ollama.env) the web user can WRITE and
#      the Ollama service user can READ. It can hold the cloud API key, so it is
#      mode 0640 — NOT world-readable.
#   3. An EnvironmentFile drop-in on ollama.service so those values reach Ollama on
#      restart.
#
# This is a deliberate privilege grant — only run it on a trusted LAN box.
#
# Usage:
#   sudo ./scripts/enable-ollama-config.sh [web-user]
#
# Then set  "system": { "ollamaConfig": true }  in cortex-config.json and restart
# the Cortex web service. To revoke:
#   rm /etc/sudoers.d/cortex-ollama-config \
#      /etc/systemd/system/ollama.service.d/cortex-env.conf
#   systemctl daemon-reload && set the flag back to false.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo ./scripts/enable-ollama-config.sh [web-user]" >&2
  exit 1
fi

WEB_USER="${1:-${SUDO_USER:-$(whoami)}}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cortex-ollama-restart.sh"
DEST="/usr/local/bin/cortex-ollama-restart.sh"
SUDOERS="/etc/sudoers.d/cortex-ollama-config"
ENV_DIR="/etc/cortex"
ENV_FILE="${ENV_DIR}/ollama.env"
DROPIN_DIR="/etc/systemd/system/ollama.service.d"
DROPIN="${DROPIN_DIR}/cortex-env.conf"

if [ ! -f "$SRC" ]; then
  echo "Restart wrapper not found at $SRC" >&2
  exit 1
fi

# 1) Root-owned wrapper + scoped sudoers, validated before it's left in place.
install -o root -g root -m 0755 "$SRC" "$DEST"
printf '%s ALL=(root) NOPASSWD: %s\n' "$WEB_USER" "$DEST" > "$SUDOERS"
chmod 0440 "$SUDOERS"
if ! visudo -cf "$SUDOERS"; then
  rm -f "$SUDOERS"
  echo "sudoers validation failed — rule removed, nothing changed." >&2
  exit 1
fi

# 2) Managed env file: web user writes it, the Ollama service user reads it.
OLLAMA_USER="$(systemctl show -p User --value ollama.service 2>/dev/null || true)"
install -d -o root -g root -m 0755 "$ENV_DIR"
if [ ! -f "$ENV_FILE" ]; then
  install -o "$WEB_USER" -g "$WEB_USER" -m 0640 /dev/null "$ENV_FILE"
fi
# Group-read for whatever user Ollama runs as (root reads regardless).
if [ -n "$OLLAMA_USER" ] && [ "$OLLAMA_USER" != "root" ]; then
  OLLAMA_GROUP="$(id -gn "$OLLAMA_USER" 2>/dev/null || echo "$OLLAMA_USER")"
  chgrp "$OLLAMA_GROUP" "$ENV_FILE" 2>/dev/null || true
fi
chmod 0640 "$ENV_FILE"

# 3) Feed it to Ollama on (re)start. EnvironmentFile=- tolerates an empty file.
install -d -o root -g root -m 0755 "$DROPIN_DIR"
cat > "$DROPIN" <<EOF
[Service]
EnvironmentFile=-${ENV_FILE}
EOF
chmod 0644 "$DROPIN"
systemctl daemon-reload

echo "Enabled UI-driven Ollama settings:"
echo "  wrapper:  ${DEST}  (web user '${WEB_USER}' may run it via passwordless sudo)"
echo "  env file: ${ENV_FILE}  (Cortex writes; ollama${OLLAMA_USER:+ user '$OLLAMA_USER'} reads)"
echo "  drop-in:  ${DROPIN}"
echo "Next:"
echo "  1. set  \"system\": { \"ollamaConfig\": true }  in cortex-config.json"
echo "  2. restart the Cortex web service"
