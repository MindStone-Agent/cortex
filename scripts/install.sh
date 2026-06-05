#!/usr/bin/env bash
#
# Cortex — single-command installer (issue #4)
#
# Sets up Cortex on a fresh NVIDIA DGX Spark (or compatible Ubuntu box):
# Node 22 (via nvm), pnpm 9, optional Caddy, a systemd user service, and linger.
# Idempotent — safe to re-run; detects existing installs and skips/updates.
#
#   curl -fsSL https://raw.githubusercontent.com/MindStone-Agent/cortex/main/scripts/install.sh | bash
#
# Flags:
#   --port N        app port (default 3000)
#   --no-caddy      skip Caddy reverse-proxy setup
#   --path DIR      install dir (default ~/cortex)
#   --repo URL      git repo (default the public Cortex repo)
#
set -euo pipefail

REPO="https://github.com/MindStone-Agent/cortex.git"
INSTALL_DIR="$HOME/cortex"
PORT=3000
USE_CADDY=1
CADDY_PORT=80

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --no-caddy) USE_CADDY=0; shift ;;
    --path) INSTALL_DIR="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done

log() { printf '\033[36m[cortex-install]\033[0m %s\n' "$*"; }

# --- Node 22 (nvm) ---------------------------------------------------------
if command -v node >/dev/null 2>&1 && node -v | grep -qE '^v(2[0-9]|[3-9][0-9])\.'; then
  log "Node $(node -v) present"
else
  log "Installing Node 22 via nvm..."
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install 22 && nvm use 22
fi
NODE_BIN="$(dirname "$(command -v node)")"

# --- pnpm 9 (10/11 fight the build-script gate) ----------------------------
if command -v pnpm >/dev/null 2>&1 && pnpm -v | grep -qE '^9\.'; then
  log "pnpm $(pnpm -v) present"
else
  log "Installing pnpm 9..."
  npm install -g pnpm@9
fi

# --- Caddy (optional) ------------------------------------------------------
if [ "$USE_CADDY" = 1 ]; then
  if command -v caddy >/dev/null 2>&1; then
    log "Caddy present"
  else
    log "Installing Caddy (apt)..."
    sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    sudo apt-get update && sudo apt-get install -y caddy
  fi
fi

# --- Repo ------------------------------------------------------------------
if [ -d "$INSTALL_DIR/.git" ]; then
  log "Repo exists at $INSTALL_DIR — updating"
  git -C "$INSTALL_DIR" pull --ff-only || log "  (skipped pull — local changes present)"
else
  log "Cloning to $INSTALL_DIR"
  git clone "$REPO" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# --- Config (seed once; never overwrite the user's) ------------------------
if [ ! -f cortex-config.json ]; then
  cp cortex-config.example.json cortex-config.json
  log "Seeded cortex-config.json — edit it to point at your services"
fi

# --- Build -----------------------------------------------------------------
log "Installing deps + building..."
pnpm install --frozen-lockfile
pnpm build

# --- systemd user service --------------------------------------------------
log "Writing systemd user unit cortex-web.service (port $PORT)"
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/cortex-web.service" <<EOF
[Unit]
Description=Cortex — local AI command center
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=PATH=$NODE_BIN:/usr/local/bin:/usr/bin:/bin
ExecStart=$NODE_BIN/node $INSTALL_DIR/node_modules/next/dist/bin/next start
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF

# linger so the user service survives logout/reboot
loginctl enable-linger "$USER" >/dev/null 2>&1 || true
systemctl --user daemon-reload
systemctl --user enable --now cortex-web

# --- Caddy reverse proxy ---------------------------------------------------
if [ "$USE_CADDY" = 1 ]; then
  log "Configuring Caddy :$CADDY_PORT -> localhost:$PORT"
  sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
:$CADDY_PORT {
	reverse_proxy localhost:$PORT
}
EOF
  sudo systemctl reload caddy 2>/dev/null || sudo systemctl restart caddy
fi

# --- Done ------------------------------------------------------------------
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
log "Cortex is up."
if [ "$USE_CADDY" = 1 ]; then
  log "  http://${IP:-localhost}/"
else
  log "  http://${IP:-localhost}:$PORT/"
fi
