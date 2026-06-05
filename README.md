# Cortex

**The MindStone Agent command center for NVIDIA GB10 platforms.**

Cortex is a self-hostable web UI for a local AI stack. It gives you a single landing
page and live dashboard: system and GPU health, the models currently loaded across your
inference and image tools, and a configurable catalog of the services you run (Ollama,
ComfyUI, Open WebUI, and more).

Cortex is built specifically for [NVIDIA GB10-based platforms](https://www.nvidia.com/en-us/products/workstations/dgx-spark/) —
it was developed on the **NVIDIA DGX Spark**, the GB10-powered reference platform — and
it's themable so you can brand it as your own.

> **On the name:** the cerebral *cortex* is the brain's integrative layer — a fitting
> name for the surface that pulls together signals from all of your local-AI tools.

## Screenshots

_Dashboard screenshot coming soon._

<!-- TODO: add dashboard screenshot (place under public/ or docs/ and reference here) -->

## Features

- **Dashboard** — at-a-glance system health: CPU, unified memory, GPU (utilization /
  temperature / power), disk, and uptime.
- **Live performance (Server-Sent Events)** — a 1 Hz telemetry stream of CPU %, memory %,
  GPU utilization, GPU temperature, and GPU power draw.
- **Models view** — discovers loaded and available models from your inference server
  (Ollama `/api/tags` + `/api/ps`) and categorizes them.
- **Services catalog** — a configurable grid of the tools you run, each with a live
  health check and a quick link.
- **Themable** — ships with the default MindStone Agent brand (a warm "ink" palette with
  MindStone gold and NVIDIA green accents); fully overridable as the theme work lands.

## Status

Active development — currently **v0.2** (dashboard complete).

| Milestone | State |
| --- | --- |
| Services landing page with health checks | ✅ Done |
| Dashboard — system stats (CPU / memory / GPU / disk / uptime) | ✅ Done |
| Live performance telemetry over SSE | ✅ Done |
| Models view (Ollama) | ✅ Done |
| Portability refactor — config-driven services, auto-discovery, `install.sh` | ◻ Planned (v0.3) |
| Theme overrides (rebrandable) | ◻ Planned (v0.3) |
| Public release — docs, screenshots, demo | ◻ Planned (v1.0) |

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack)
- **Tailwind CSS 4** (CSS-first `@theme`)
- **Caddy** reverse proxy (`:80`)
- **Node 22** · **pnpm 9** (pinned — see notes below)
- **systemd** user unit for process management (linger required)

## Requirements

- An NVIDIA GB10 platform (developed on the DGX Spark; any Linux host with a local AI
  stack works for development).
- Node 22+ and pnpm 9.
- *(Optional)* Caddy for reverse proxy / TLS.
- *(Optional)* NVIDIA drivers and `nvidia-smi` for GPU telemetry.

## Quick start

```bash
git clone https://github.com/MindStone-Agent/cortex.git
cd cortex
pnpm install

# Point Cortex at your own services:
#   edit data/services.json (url / port / healthPath for each service)

pnpm dev          # development server on http://localhost:3000
```

For production: `pnpm build && pnpm start`, typically behind Caddy.

## Configuration

Services are declared in [`data/services.json`](data/services.json). Each entry has an
`id`, `name`, `tagline`, `description`, `url`, `port`, `healthPath`, an `icon`, and a
`side` (`"mindstone"` or `"nvidia"`) that selects its accent color. The shipped file uses
`localhost` defaults — edit it to match your own hosts and ports. Models are read from a
local Ollama instance (`localhost:11434`) by the models API.

> A portable, schema-driven config (`cortex-config.json`) and auto-discovery are on the
> v0.3 roadmap; today, `data/services.json` is the single source of truth.

## Notes

- **pnpm is pinned to 9.x.** pnpm 10/11 changed the build-script approval flow in a way
  that fights the install-during-build step; pnpm 9 avoids it.
- **Tailwind 4** uses the CSS-first `@theme` directive in `app/globals.css` (no
  `tailwind.config.js`).

## License

[MIT](LICENSE) © 2026 Clint Bodungen and contributors.
