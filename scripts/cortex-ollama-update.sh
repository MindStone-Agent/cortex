#!/usr/bin/env bash
# Cortex — pinned Ollama update wrapper.
#
# This is the ONLY command Cortex's web user is granted passwordless sudo for.
# It takes NO arguments, so nothing user-controlled ever reaches root. It must be
# installed root-owned and NOT writable by the Cortex web user (otherwise that user
# could rewrite it and escalate). scripts/enable-ollama-update.sh installs it
# correctly (/usr/local/bin, root:root, 0755) alongside the matching sudoers rule.
#
# All it does: run Ollama's official installer, then restart the service.
set -euo pipefail

echo "[cortex-ollama-update] before: $(ollama --version 2>/dev/null | head -1 || echo unknown)"
curl -fsSL https://ollama.com/install.sh | sh
systemctl restart ollama
sleep 2
echo "[cortex-ollama-update] after:  $(ollama --version 2>/dev/null | head -1 || echo unknown)"
echo "[cortex-ollama-update] done"
