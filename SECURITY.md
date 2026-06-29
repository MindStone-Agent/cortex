# Security

Cortex is a **self-hosted dashboard for a single trusted machine on a private
network** — it was built for a DGX Spark on a home/lab LAN. Please read this before
exposing it anywhere beyond that.

## Default posture

- **No authentication.** Cortex ships with no login. Anyone who can reach it on the
  network can use it. This is intentional for a trusted-LAN dashboard — it is **not**
  safe to expose to the public internet or an untrusted network as-is.
- **Plain HTTP.** The bundled Caddy config serves on `:80` with no TLS.
- **Binds all interfaces.** `next start` listens on `0.0.0.0:3000` and Caddy proxies
  `:80 → localhost:3000`, so both ports are reachable from the LAN by default.

### What an unauthenticated visitor can do by default

- Read system + GPU telemetry, host OS/kernel/driver versions, disk usage, and your
  loaded/available Ollama models (`/api/system`, `/api/perf`, `/api/models`, `/api/health`).
- See which common AI-tool ports are open on the host (`/api/discover`).
- Change the dashboard's appearance (`/api/settings` writes `theme.json` — cosmetic only).

No privileged or system-changing actions are possible in the default configuration.

### Opt-in privileged actions (OFF by default)

Several features perform system actions and stay disabled unless you explicitly enable them
in `cortex-config.json`:

- **`system.ollamaUpdate`** — a button that updates + restarts Ollama. Requires a
  separate scoped setup (`scripts/enable-ollama-update.sh`) that grants the Cortex user
  passwordless sudo for **one fixed, argument-less wrapper script only**
  (`scripts/cortex-ollama-update.sh`, installed root-owned).
- **`system.ollamaConfig`** — Settings → Ollama writes Ollama's server defaults (cloud API
  key, context length, keep-alive) and restarts Ollama to apply them. Requires
  `scripts/enable-ollama-config.sh`, which adds an EnvironmentFile drop-in and grants
  passwordless sudo for **one fixed, argument-less restart wrapper only**
  (`scripts/cortex-ollama-restart.sh`, root-owned). Cortex writes the env file **as its own
  user**, so nothing user-controlled reaches root — root only restarts the service.
- **`system.cortexUpdate`** — pull + rebuild + restart Cortex from the dashboard. Runs **as the
  Cortex web user** (no sudo on the standard systemd-user deploy: the user owns the checkout and
  restarts its own unit). It does run `git pull` + `pnpm build` from the configured `origin`, so
  treat write access to that remote as trusted.
- **`system.toolInstall`** — one-click installs from Settings → Tools. Runs `docker run`
  for a **hardcoded catalog** of images via `execFile` (no shell, no user input reaches
  the system — the UI only picks which catalog id to install). Requires the Cortex user
  in the `docker` group; no sudo.
- **`system.tailscale`** — install / connect / disconnect Tailscale. Requires
  `scripts/enable-tailscale-control.sh`, which grants passwordless sudo for **three fixed
  verbs** (`status` / `up` / `down`) of one root-owned wrapper.

Each is deliberately bounded (a fixed wrapper / a fixed catalog / fixed verbs — never arbitrary
commands), but once enabled they are reachable **without authentication** by anyone on the
network. **Only enable them on a trusted LAN.**

To revoke:
- `system.ollamaUpdate` → set `false`, then `rm /etc/sudoers.d/cortex-ollama-update`.
- `system.ollamaConfig` → set `false`, then `rm /etc/sudoers.d/cortex-ollama-config
  /etc/systemd/system/ollama.service.d/cortex-env.conf` and `systemctl daemon-reload`.
- `system.cortexUpdate` → set `false`.
- `system.toolInstall` → set `false`.
- `system.tailscale` → set `false`, then `rm /etc/sudoers.d/cortex-tailscale`.

### Stored credentials

Two optional integrations store a secret server-side, in files Cortex writes **owner-readable**
and **never** serializes to the browser:

- **Hugging Face token** (`cortex-config.json`) — a read token for gated/private model search.
- **Ollama Cloud API key** (`/etc/cortex/ollama.env`, only with `system.ollamaConfig` set up) —
  fed to the Ollama service via an EnvironmentFile drop-in.

The Settings panels show only **whether** a credential is set (and, for cloud auth, the resolved
account name) — never the value. As with everything in Cortex, that configured-state and account
name are visible to anyone who can reach the unauthenticated dashboard, so keep secrets off any
deployment you haven't put authentication in front of.

## Exposing Cortex beyond a trusted LAN

Cortex stays auth-less by design — put the access control in front of it.

1. **Authentication at the proxy (recommended).** Add HTTP basic auth to Caddy:
   ```
   :80 {
       basic_auth {
           # generate the hash with:  caddy hash-password
           youruser <bcrypt-hash>
       }
       reverse_proxy localhost:3000
   }
   ```
   Then reload Caddy. (`basicauth` on Caddy v1/early-v2; `basic_auth` on current Caddy.)

2. **Close the direct port.** Proxy auth only protects `:80` — `next start` still listens
   on `:3000`. Either firewall `:3000`, or bind Next to localhost so only Caddy can reach
   it: set `HOSTNAME=127.0.0.1` (or `next start -H 127.0.0.1`) in the systemd unit.

3. **Don't port-forward it to the internet.** For remote access use a private overlay
   network (Tailscale / WireGuard) or an SSH tunnel. If it must leave your LAN, terminate
   TLS at Caddy (automatic with a real domain).

4. **Keep the opt-in actions off** unless you've put authentication in front.

## Reporting a vulnerability

Open a GitHub issue with repro steps. For anything sensitive, please contact the
maintainers privately rather than filing a public issue.
