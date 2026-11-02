#!/usr/bin/env bash
# Cortex — opt in to showing contained Ollama runtimes on the dashboard.
#
# Installs a systemd *user* service that runs scripts/cortex-contained-ollama.py as the
# Cortex web user. The collector reads each `containedOllama` entry in cortex-config.json
# with `docker exec <container> ollama ps|list` and writes snapshots to
# ~/.cache/cortex/contained/. The Cortex web process only reads those files.
#
# Requires: the Cortex user is in the `docker` group, and cortex-config.json has a
# `containedOllama` list. No root needed. To remove:
#   systemctl --user disable --now cortex-contained-ollama && rm ~/.config/systemd/user/cortex-contained-ollama.service
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT="$HOME/.config/systemd/user/cortex-contained-ollama.service"

id -nG | tr ' ' '\n' | grep -qx docker || { echo "[contained-ollama] $(id -un) is not in the docker group" >&2; exit 1; }
python3 "$ROOT/scripts/cortex-contained-ollama.py" --once
mkdir -p "$(dirname "$UNIT")"
cat > "$UNIT" <<UNIT
[Unit]
Description=Cortex — contained Ollama collector (docker exec ollama ps/list -> ~/.cache/cortex/contained)
After=default.target

[Service]
Type=simple
WorkingDirectory=$ROOT
ExecStart=/usr/bin/python3 $ROOT/scripts/cortex-contained-ollama.py
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now cortex-contained-ollama
echo "[contained-ollama] running; snapshots in ~/.cache/cortex/contained/"
