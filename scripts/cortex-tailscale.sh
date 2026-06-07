#!/usr/bin/env bash
# Cortex — pinned Tailscale control wrapper.
#
# The ONLY tailscale entrypoint Cortex's web user is granted passwordless sudo for.
# It accepts exactly ONE of three fixed verbs (status|up|down) and validates it, so
# nothing else user-controlled ever reaches root. Install it root-owned and NOT
# writable by the web user (scripts/enable-tailscale-control.sh does this:
# /usr/local/bin, root:root, 0755, + a sudoers rule pinned to these three verbs).
#
# Always prints `tailscale status --json` to STDOUT (the API parses it); any up/down
# chatter (including the auth URL on first login) goes to STDERR — the URL also
# surfaces in the status JSON as .AuthURL.
set -uo pipefail
TS="$(command -v tailscale || echo /usr/bin/tailscale)"

case "${1:-}" in
  status)
    : ;;
  up)
    # Kick off connect/login. --timeout keeps it from blocking the API; if login is
    # needed the auth URL appears in `status --json` (.AuthURL).
    "$TS" up --timeout=7s 1>&2 || true ;;
  down)
    "$TS" down 1>&2 || true ;;
  *)
    echo "usage: cortex-tailscale.sh {status|up|down}" >&2
    exit 2 ;;
esac

exec "$TS" status --json
