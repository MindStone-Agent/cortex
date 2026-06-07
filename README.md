# Cortex

**A self-hostable command center for your local AI stack on NVIDIA GB10 platforms.**

Cortex is a self-hostable web UI for a local AI stack. It gives you a single landing
page and live dashboard: system and GPU health, the models currently loaded across your
inference and image tools, and a configurable catalog of the services you run (Ollama,
ComfyUI, Open WebUI, and more).

Cortex is built specifically for [NVIDIA GB10-based platforms](https://www.nvidia.com/en-us/products/workstations/dgx-spark/) —
it was developed on the **NVIDIA DGX Spark**, the GB10-powered reference platform — and
it's themable so you can brand it as your own.

## Why Cortex?

The DGX Spark ships with a clean dashboard that gets you up and running quickly. Spending
time with ours, we just found we wanted a deeper, at-a-glance view of what the box was
doing day to day — which models are resident in memory right now, per-model context
windows, GPU **power draw** (the only reliable activity signal on GB10's unified-memory
architecture — see below), host OS / kernel / driver versions, and a live health check for
every service we run. That level of detail turned out to be genuinely useful, so we pulled
it all onto a single pane of glass. Cortex is the result.

> **On the name:** the cerebral *cortex* is the brain's integrative layer — a fitting
> name for the surface that pulls together signals from all of your local-AI tools.

## Screenshots

![Cortex dashboard running on an NVIDIA DGX Spark (GB10)](docs/dashboard.png)

*The dashboard live on a DGX Spark: power-primary GPU telemetry (utilization is unreliable
on GB10, so power leads), system + host versions, the currently-loaded model, and the full
model inventory with per-model context windows.*

![Cortex services page with live health checks](docs/services.png)

*The services catalog: a configurable grid of the tools you run — each card with a live
health check and a direct link. Edit the catalog in `cortex-config.json`, or let
`/api/discover` find what's already listening on localhost.*

## Features

- **Dashboard** — at-a-glance system health: CPU, GPU, disk, uptime, host OS/kernel/NVIDIA-
  driver versions, and the models currently resident in Ollama.
- **Live performance (Server-Sent Events)** — a 1 Hz telemetry stream. On unified-memory
  hardware (GB10), GPU **power draw** is the primary activity signal — `nvidia-smi`
  utilization is unreliable there (it sticks high while a process is merely resident), so
  util is de-emphasized; on discrete GPUs, utilization is primary. Memory shows % and GB.
- **Models view** — loaded and available models from Ollama, categorized, with the
  **context window per model**.
- **Services catalog** — a configurable grid of the tools you run, each with a live health
  check. **Auto-discovery** (`/api/discover`) probes localhost for common AI-tool ports.
- **Settings panel** — a gear-icon drawer to toggle the NVIDIA logo and manage tool installs,
  no file editing required.
- **One-click tool installs (opt-in)** — install common AI tools (Open WebUI, Jupyter Lab)
  straight from Settings → Tools; ComfyUI, Synapse, and Unsloth Studio show live status and
  install notes. A successfully installed tool is auto-added to your services. Off by
  default, gated behind `system.toolInstall`.
- **Ollama version + updates (opt-in)** — see the installed Ollama version, get flagged when
  a newer release is available, and optionally update + restart Ollama from the dashboard.
- **Themable** — rebrand the name, logo, and color palette via `theme.json`, no rebuild
  required.
- **Hardware-aware** — detects unified (GB10) / discrete-VRAM / CPU-only and adapts.

## Status

Active development — **v0.4**.

| Milestone | State |
| --- | --- |
| Services landing page with health checks | ✅ |
| Dashboard — system stats + host versions + loaded models | ✅ |
| Live performance telemetry over SSE | ✅ |
| Models view (Ollama) + context window | ✅ |
| Hardware-mode detection (unified / discrete / cpu-only) | ✅ |
| Config-driven services + auto-discovery | ✅ |
| Theme overrides (rebrandable) | ✅ |
| Settings panel — logo toggle + tool manager | ✅ |
| Ollama version check + opt-in update / restart | ✅ |
| One-click tool installs (opt-in) | ✅ |
| `install.sh` + OpenWebUI setup script | ✅ |
| Public release — docs, demo | ◻ (v1.0) |

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack)
- **Tailwind CSS 4** (CSS-first `@theme`)
- **Caddy** reverse proxy (`:80`)
- **Node 22** · **pnpm 9** (pinned — see notes)
- **systemd** user unit for process management (linger required)

## Requirements

- An NVIDIA GB10 platform (developed on the DGX Spark; any Linux host with a local AI
  stack works for development).
- Node 22+ and pnpm 9.
- *(Optional)* Caddy for reverse proxy / TLS.
- *(Optional)* NVIDIA drivers and `nvidia-smi` for GPU telemetry; Docker for the
  OpenWebUI setup script.

## Quick start

**One-command install** (fresh GB10 / Ubuntu box) — Node 22, pnpm 9, Caddy, build, and a
systemd user service:

```bash
curl -fsSL https://raw.githubusercontent.com/MindStone-Agent/cortex/main/scripts/install.sh | bash
```

Flags: `--port N`, `--no-caddy`, `--path DIR`. See [`scripts/install.sh`](scripts/install.sh).

**Or manually:**

```bash
git clone https://github.com/MindStone-Agent/cortex.git
cd cortex
pnpm install
cp cortex-config.example.json cortex-config.json   # then edit for your services
pnpm dev          # development server on http://localhost:3000
```

For production: `pnpm build && pnpm start`, typically behind Caddy.

## Configuration

Both config files are read at **runtime** — edits apply without a rebuild — and are
gitignored so your setup never gets committed.

- **`cortex-config.json`** (copy from `cortex-config.example.json`) — the services Cortex
  surfaces. Each entry has `id`, `name`, `tagline`, `description`, `url`, `port`,
  `healthPath`, an `icon`, and a `side` (`"primary"` / `"nvidia"`) that picks its accent.
  Not sure what you're running? `GET /api/discover` probes localhost for common AI-tool
  ports and returns what it finds.
- **`theme.json`** (copy from `theme.example.json`) — appearance. Pick a **theme** from
  **Settings → Theme** in the UI (e.g. *DGX Spark* or *MindStone*) — a theme sets the
  **logo**, header **subtitle**, and **color palette**. The product **name (Cortex)** is
  the one fixed bit of identity. For finer control, edit `brand` (name / logo / tagline)
  and `colors` (override any Tailwind `@theme` token by name, e.g. `gold-500`) directly;
  add your own theme presets in `app/lib/themes.ts`.

Models are read from a local Ollama instance (`localhost:11434`).

### Ollama updates from the dashboard (opt-in)

The dashboard shows the installed Ollama version and flags when a newer release is
available (compared against the Ollama GitHub releases). It can also **update + restart
Ollama for you** — but because that's a privileged action and Cortex serves
unauthenticated on the LAN, it's **off by default** and gated behind a deliberate,
scoped opt-in:

```bash
sudo ./scripts/enable-ollama-update.sh        # installs a root-owned pinned wrapper + a tight sudoers rule
# then set  "system": { "ollamaUpdate": true }  in cortex-config.json and restart Cortex
```

`enable-ollama-update.sh` grants the Cortex web user passwordless sudo for **only one
fixed, argument-less script** ([`scripts/cortex-ollama-update.sh`](scripts/cortex-ollama-update.sh),
installed root-owned and not writable by the web user) — nothing else, and nothing
user-controlled ever reaches root. Without this opt-in, the dashboard simply shows the
"update available" badge and the command to run yourself. Only enable it on a trusted
LAN deployment. To revoke: `rm /etc/sudoers.d/cortex-ollama-update` and set the flag back
to `false`.

### Tool installs from the dashboard (opt-in)

**Settings → Tools** lists a small catalog of AI tools with live status
(`running` / `available` / `unsupported` for your architecture). Docker-based tools
(Open WebUI, Jupyter Lab) can be installed with one click; script-based tools (ComfyUI,
Synapse, Unsloth Studio) show their status and a short install note. When a UI-serving tool
installs successfully, Cortex adds it to your services page automatically.

One-click installs are **off by default**. To enable them, set `"system": { "toolInstall":
true }` in `cortex-config.json` and restart Cortex. No sudo is involved — the Cortex web
user just needs to be in the **`docker`** group. Installs run catalog-defined `docker run`
commands via `execFile` (no shell, and nothing user-controlled ever reaches the system —
the UI only selects *which* catalog entry to install). As with the Ollama updater, only
enable this on a trusted LAN deployment; left off, the Tools panel is read-only status.

## Scripts

- **[`scripts/install.sh`](scripts/install.sh)** — single-command setup (above); idempotent.
- **[`scripts/enable-ollama-update.sh`](scripts/enable-ollama-update.sh)** — opt in to
  UI-driven Ollama updates (scoped passwordless-sudo wrapper); see above.
- **[`scripts/setup-openwebui.sh`](scripts/setup-openwebui.sh)** — points Open WebUI at host
  Ollama (off the bundled-Ollama `:ollama` image onto `:main`, preserving the data volume)
  and sets `ENABLE_RAG_LOCAL_WEB_FETCH=true` so private-LAN ComfyUI image URLs aren't
  rejected by OpenWebUI's SSRF guard.

## Notes

- **pnpm is pinned to 9.x.** pnpm 10/11 changed the build-script approval flow in a way
  that fights the install-during-build step; pnpm 9 avoids it.
- **Tailwind 4** uses the CSS-first `@theme` directive in `app/globals.css` (no
  `tailwind.config.js`); `theme.json` overrides those tokens at runtime.

## License

[MIT](LICENSE) © 2026 Clint Bodungen and contributors.
