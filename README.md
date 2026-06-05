# Cortex

**The MindStone Agent command center — a self-hostable web UI for your local AI stack.**

Cortex is a single landing surface for a local-inference environment. It gives you a
live dashboard of system and GPU health, a view of the models currently loaded across
your inference and image-generation tools, and a configurable catalog of the services
you run (inference servers, image pipelines, chat UIs, agent comms, and more).

It's built for an [NVIDIA DGX Spark](https://www.nvidia.com/en-us/products/workstations/dgx-spark/)
or any modern Linux host running a local AI stack, and it's fully themable so you can
brand it as your own.

> **On the name:** the cerebral *cortex* is the brain's integrative layer — a fitting
> name for the surface that pulls together signals from all of your local-AI tools.

---

## Features

- **Dashboard** — at-a-glance system health: CPU, RAM, GPU, disk, and network.
- **Live performance (Server-Sent Events)** — ~1-second streaming telemetry: GPU
  utilization / memory / power draw / temperature, per-core CPU, RAM, disk I/O, and
  network I/O.
- **Models view** — discovers models from your inference server (e.g. Ollama's
  `/api/tags` and `/api/ps`) and from local model directories (e.g. ComfyUI
  `checkpoints` / `unet` / `vae` / `loras`), categorized via a manifest with an
  auto-detect fallback, and shows what's currently loaded.
- **Services catalog** — a configurable list of the tools you run, each with a health
  check and a quick link. Combines auto-discovery with a known-services catalog.
- **Theming & white-labeling** — ships with a default "Cortex" brand that you can fully
  override (name, logo, color tokens) via a theme file.

## Architecture

| Layer | Technology |
| --- | --- |
| Framework | Next.js 15 (App Router, TypeScript, Turbopack) |
| Styling | Tailwind CSS 4 (CSS-first `@theme`) |
| Reverse proxy | Caddy 2 (routing + TLS) |
| Runtime | Node 22, pnpm |
| Process management | systemd (user unit) |
| Data sources | Local inference / tooling HTTP APIs (endpoints are configurable) |

Cortex ships with **no hardcoded hosts** — every endpoint is something you point at your
own environment via configuration.

## Requirements

- A Linux host. Built and tested on an NVIDIA DGX Spark; any modern Linux box running a
  local AI stack works.
- Node 22+ and pnpm.
- *(Optional)* Caddy, for reverse proxy and TLS in front of the app.
- *(Optional)* NVIDIA drivers and `nvidia-smi`, for GPU telemetry.

## Quick start

```bash
git clone https://github.com/MindStone-Agent/cortex.git
cd cortex
pnpm install

# Point Cortex at your own services and endpoints:
cp cortex-config.example.json cortex-config.json

pnpm dev          # development server on http://localhost:3000
```

For production:

```bash
pnpm build
pnpm start        # serve the built app (typically behind Caddy)
```

## Configuration

Cortex is config-driven. Copy the example files and edit them to match your environment —
nothing host-specific is baked into the source.

- **`cortex-config.json`** — declares the services Cortex should surface. Each entry has
  a name, base URL, optional health endpoint, category, and icon. Start from
  [`cortex-config.example.json`](cortex-config.example.json).
- **`theme.json`** — brand overrides: display name, logo path, and color tokens. Start
  from [`theme.example.json`](theme.example.json). Leave it out to use the default Cortex
  brand.

All endpoints in the examples use `localhost` with each tool's standard default port —
replace them with your own.

## Roadmap

- [x] Services landing page with health checks
- [ ] Dashboard with system stats (CPU / RAM / GPU / disk / network)
- [ ] Live performance telemetry over SSE
- [ ] Models view (inference servers + image pipelines)
- [ ] Service auto-discovery + known-services catalog
- [ ] One-command installer
- [ ] Theming / white-label polish

## Contributing

Issues and pull requests are welcome. A `CONTRIBUTING.md` with development setup and
conventions will land alongside the application code.

## License

[MIT](LICENSE) © 2026 Clint Bodungen and contributors.
