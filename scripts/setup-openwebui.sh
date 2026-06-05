#!/usr/bin/env bash
#
# Cortex — OpenWebUI reconfig (issues #5 + #10)
#
# NVIDIA's published OpenWebUI instructions ship the `:ollama` image, which
# bundles a SECOND Ollama inside the container and duplicates models. On a box
# with host Ollama already running, the correct setup is the `:main` image
# pointed at host Ollama. This also bakes in ENABLE_RAG_LOCAL_WEB_FETCH=true so
# ComfyUI image URLs on a private LAN aren't rejected by OpenWebUI's SSRF guard.
# The named `open-webui` volume is preserved, so the admin account + settings survive.
#
set -euo pipefail

PORT=8080
OLLAMA_PORT=11434
HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --host-ip) HOST_IP="$2"; shift 2 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done
HOST_IP="${HOST_IP:-127.0.0.1}"

log() { printf '\033[36m[setup-openwebui]\033[0m %s\n' "$*"; }
command -v docker >/dev/null 2>&1 || { echo "docker not found" >&2; exit 1; }

IMAGE="ghcr.io/open-webui/open-webui:main"

if docker ps -a --format '{{.Names}}' | grep -qx open-webui; then
  CUR_IMG="$(docker inspect --format '{{.Config.Image}}' open-webui 2>/dev/null || true)"
  log "Existing open-webui container (image: ${CUR_IMG:-unknown})"
  if printf '%s' "$CUR_IMG" | grep -q ':ollama'; then
    log "  -> bundled-Ollama :ollama variant detected; switching to :main"
  else
    log "  -> recreating with the corrected env"
  fi
  docker stop open-webui >/dev/null 2>&1 || true
  docker rm open-webui >/dev/null 2>&1 || true
  # The named 'open-webui' volume is intentionally NOT removed (preserves admin + settings).
fi

log "Pulling $IMAGE"
docker pull "$IMAGE"

log "Starting open-webui :main -> host Ollama http://${HOST_IP}:${OLLAMA_PORT} (RAG local web-fetch enabled)"
docker run -d \
  -p "${PORT}:8080" \
  -e "OLLAMA_BASE_URL=http://${HOST_IP}:${OLLAMA_PORT}" \
  -e "ENABLE_RAG_LOCAL_WEB_FETCH=true" \
  -v open-webui:/app/backend/data \
  --name open-webui \
  --restart unless-stopped \
  "$IMAGE" >/dev/null

log "Done. Open WebUI: http://${HOST_IP}:${PORT}/"
log "  - models served by host Ollama (no duplicate bundled instance)"
log "  - ENABLE_RAG_LOCAL_WEB_FETCH=true so private-LAN ComfyUI image URLs aren't SSRF-blocked"
