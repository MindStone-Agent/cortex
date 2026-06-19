# Changelog

All notable changes to Cortex are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Formal GitHub Releases begin at **v1.0** — until then, each tagged version is a
clean install point and its notes live here.

## [Unreleased]

Tracked toward **v1.0** (see the [v1.0 milestone](https://github.com/MindStone-Agent/cortex/milestone/1)):
a verified clean install on a stock DGX Spark and a demo + landing pitch.

## [0.5.0] — 2026-06-19

### Added
- **Model discovery + pull** (#23/#24) — a new **Models** page to find and install models you
  don't have yet. Search the **Ollama library** and **Hugging Face** (with a manual **Refresh**
  to pick up newly-announced Ollama models immediately, instead of waiting for the daily cache),
  then **pull** a chosen model or parameter size straight to your local Ollama with **live
  download progress**. Discovery only — your installed inventory stays on the dashboard, and
  pulls use Ollama's own API (no extra config or privileged access).
- **Tailscale control** (Settings → Remote access, toward v1.0, #21) — install and control
  Tailscale from the UI (status, connect/disconnect, tailnet IP, one-time login URL) as the
  recommended remote-access path. Off by default behind `system.tailscale`; enable with
  `scripts/enable-tailscale-control.sh`, which installs Tailscale + a root-owned wrapper
  pinned to three verbs (`status`/`up`/`down`) + a tight sudoers rule.
- **Security documentation + posture** (toward v1.0, #16) — a `SECURITY.md` threat
  model (no auth / LAN-only by default, exactly what's exposed, the opt-in privileged
  actions and how to revoke them, and hardening: proxy `basic_auth`, binding to localhost,
  Tailscale/SSH for remote). A README **Security** section, plus in-product notes: an
  amber warning when one-click installs are enabled and a standing "no authentication"
  line in the Settings panel.
- **Theme selector** (Settings → Theme) — pick a built-in theme preset from the UI;
  applying one swaps the **logo**, header **subtitle**, and **color palette** and
  persists to `theme.json`. Ships with **DGX Spark** (default — Cortex glyph, NVIDIA-green
  palette) and **MindStone** (gold diamond, gold palette) presets; add more in
  `app/lib/themes.ts`.

### Changed
- **Neutral by default** (toward v1.0, #14) — the shipped default no longer assumes
  MindStone branding. The default theme is **DGX Spark** (Cortex glyph logo, "DGX Spark
  command center" subtitle, NVIDIA-green palette). The product **name (Cortex)** is the
  one fixed bit of identity; a theme varies the logo, subtitle, and palette. The
  service-card accent value `side: "mindstone"` is now `side: "primary"` (`"nvidia"`
  unchanged; legacy `"mindstone"` still renders as the primary accent).

## [0.4.0] — 2026-06-07

### Added
- **Settings panel** — a gear-icon drawer in the header to toggle the NVIDIA logo
  and manage tool installs without editing files.
- **One-click tool installs (opt-in)** — Settings → Tools lists a catalog of AI
  tools with live status (`running` / `available` / `unsupported`). Docker-based
  tools (Open WebUI, Jupyter Lab) install with one click; script-based tools
  (ComfyUI, Synapse, Unsloth Studio) show status and an install note. A
  UI-serving tool is auto-added to the services page on successful install.
  Off by default, gated behind `system.toolInstall` (requires the Cortex web
  user in the `docker` group; no sudo).
- **Ollama version + updates (opt-in)** — the dashboard shows the installed Ollama
  version, flags when a newer release is available, and can update + restart
  Ollama. Off by default, gated behind `system.ollamaUpdate` via a scoped
  root-owned wrapper + tight sudoers rule (`scripts/enable-ollama-update.sh`).

### Fixed
- Settings panel is portaled to `document.body` so it isn't clipped by the
  header's `backdrop-filter` containing block.
- NVIDIA logo toggle now hides instantly and persists (layout is `force-dynamic`
  so runtime `theme.json` edits apply; logo is client-state driven).

## [0.3.0] — 2026-06-05

### Added
- Runtime-loaded `cortex-config.json` — services config applied without a rebuild.
- Bundled known-services catalog + auto-discovery (`/api/discover`) that probes
  localhost for common AI-tool ports.
- Hardware-mode detection (unified GB10 / discrete-VRAM / CPU-only) with adaptive
  telemetry — GPU power draw is primary on unified memory (utilization is
  unreliable there); utilization is primary on discrete GPUs.
- Models view with the context window per model (large windows formatted e.g. "10M").
- Runtime-rebrandable `theme.json` (name / logo / color tokens), no rebuild.
- Single-command `install.sh` (Node 22, pnpm 9, Caddy, build, systemd user unit).
- Open WebUI reconfigure script (`:ollama` → `:main` image, preserves the data
  volume, fixes the SSRF guard for private-LAN image URLs).

[Unreleased]: https://github.com/MindStone-Agent/cortex/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/MindStone-Agent/cortex/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/MindStone-Agent/cortex/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/MindStone-Agent/cortex/releases/tag/v0.3.0
