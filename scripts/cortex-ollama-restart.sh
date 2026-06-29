#!/usr/bin/env bash
# Cortex — pinned Ollama restart wrapper.
#
# The ONLY command Cortex's web user is granted passwordless sudo for via the
# ollama-config feature. It takes NO arguments, so nothing user-controlled ever
# reaches root. It must be installed root-owned and NOT writable by the Cortex web
# user (otherwise that user could rewrite it and escalate). enable-ollama-config.sh
# installs it correctly (/usr/local/bin, root:root, 0755) with a matching sudoers
# rule.
#
# All it does: restart Ollama so Cortex-managed env changes (cloud API key, context
# length, keep-alive — written by the web user to /etc/cortex/ollama.env) take
# effect. The values themselves never pass through here.
set -euo pipefail

systemctl restart ollama
sleep 2
echo "[cortex-ollama-restart] restarted; $(ollama --version 2>/dev/null | head -1 || echo 'version unknown')"
echo "[cortex-ollama-restart] done"
