# Changelog

All notable changes to Cortex are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Formal GitHub Releases begin at **v1.0** — until then, each tagged version is a
clean install point and its notes live here.

## [Unreleased]

Tracked toward **v1.0** (see the [v1.0 milestone](https://github.com/MindStone-Agent/cortex/milestone/1)):
a verified clean install on a stock DGX Spark and a demo + landing pitch.

## [0.6.0] — 2026-06-29

### Added
- **Model lifecycle controls** (#25) — act on your installed Ollama models right from the
  dashboard inventory: **Load** a model into memory, **Unload** it to free VRAM, or **Remove**
  it from disk (confirm-gated). Speaks only Ollama's HTTP API (`/api/generate` `keep_alive`,
  `/api/delete`) — no shell, no privileged access.
- **Ollama settings panel** (Settings → Ollama, #26) — view and set Ollama's server defaults
  from the UI: the **Ollama Cloud API key** (validated on save, shows the signed-in account),
  the **default context length**, and the **default keep-alive / model timeout**. Cortex writes
  a managed env file it owns; applying restarts Ollama via a **no-arg** root wrapper, so nothing
  user-controlled reaches root. Off by default behind `system.ollamaConfig`; enable with
  `scripts/enable-ollama-config.sh`.
- **Update Cortex from the UI** (#29) — the System-stats card shows the running Cortex version,
  flags when `origin` is ahead, and can **pull + rebuild + restart** Cortex for you. Needs **no
  root** on the standard systemd-user deploy (the web user owns the checkout and restarts its
  own unit); a failed build never goes live, and the restart is detached so the response returns
  first. Off by default behind `system.cortexUpdate` (set `CORTEX_RESTART_CMD` / `CORTEX_SERVICE`
  for non-systemd deploys).
- **Hugging Face API token** (Settings → Integrations, #27) — store an HF read token to search
  and pull **gated/private** GGUF repos and lift anonymous rate limits. Verified on save (HF
  `whoami`), stored server-side in `cortex-config.json` (owner-only), attached to HF API calls,
  and **never sent to the browser**.
- **vLLM in the tool catalog** (Settings → Tools, #28) — the high-throughput, OpenAI-compatible
  open-source serving engine, with an arch-accurate run command (the image is multi-arch:
  amd64 + arm64) that also wires in your HF token. (vLLM is not NVIDIA's own — that's **NIM**,
  tracked as a follow-on.)

### Changed
- **Resilient model downloads** (#30) — pulls are now tracked **server-side**: a registry owns
  the Ollama download stream, so it keeps going even if you navigate away or reload. The Models
  page shows an always-visible **Active downloads** panel and **reattaches** to in-flight pulls
  on mount; re-issuing a pull attaches instead of duplicating. (In-memory, so a Cortex restart
  resets tracking — Ollama resumes the download by digest on the next pull.)

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

[Unreleased]: https://github.com/MindStone-Agent/cortex/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/MindStone-Agent/cortex/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/MindStone-Agent/cortex/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/MindStone-Agent/cortex/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/MindStone-Agent/cortex/releases/tag/v0.3.0
