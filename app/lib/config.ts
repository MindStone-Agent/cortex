import fs from "node:fs";
import path from "node:path";

export type Service = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  port: number;
  healthPath: string;
  /** Accent for the service card: "nvidia" (green) or "primary" (your brand color). */
  side: "primary" | "nvidia";
  icon: string;
};

export type SystemConfig = {
  /**
   * Allow the Cortex UI to update + restart Ollama via a scoped, passwordless-sudo
   * wrapper. OFF by default — enabling it is a deliberate opt-in (see
   * scripts/enable-ollama-update.sh, which installs a root-owned pinned wrapper and
   * a tight sudoers rule). Only turn this on for a trusted LAN deployment.
   */
  ollamaUpdate?: boolean;
  /**
   * Allow the Cortex UI to install tools from the catalog (catalog-defined
   * `docker run` commands — no user input reaches the shell). OFF by default.
   * Docker installs need no sudo (the web user must be in the `docker` group);
   * enabling is just a deliberate opt-in. Only turn this on for a trusted LAN box.
   */
  toolInstall?: boolean;
  /**
   * Allow the Cortex UI to control Tailscale (status / connect / disconnect) via a
   * scoped, passwordless-sudo wrapper. OFF by default (see
   * scripts/enable-tailscale-control.sh, which installs Tailscale + a root-owned
   * verb-pinned wrapper + a tight sudoers rule). This lets anyone on the LAN toggle
   * the VPN — only turn it on for a trusted LAN box.
   */
  tailscale?: boolean;
  /**
   * Allow the Cortex UI to edit Ollama's server defaults (cloud API key, context
   * length, keep-alive) and restart Ollama to apply them. OFF by default (see
   * scripts/enable-ollama-config.sh, which adds an EnvironmentFile drop-in pointing
   * at a Cortex-owned env file + a root-owned NO-ARG `systemctl restart ollama`
   * wrapper + a tight sudoers rule). Cortex writes the env file as its own user, so
   * nothing user-controlled ever reaches root — root only restarts the service.
   */
  ollamaConfig?: boolean;
  /**
   * Allow the Cortex UI to update itself: git pull + pnpm build + restart the
   * Cortex service. OFF by default. No root is required for the standard systemd
   * *user* service deploy (the web user owns the checkout and restarts its own
   * unit) — enabling is just a deliberate opt-in. Set the restart command with
   * CORTEX_RESTART_CMD / CORTEX_SERVICE for non-default deploys.
   */
  cortexUpdate?: boolean;
};

export type Integrations = {
  /**
   * Hugging Face read token — unlocks gated/private GGUF repos and higher rate
   * limits. Server-side only; never serialized to the browser. `user` is the
   * verified account label (from HF whoami) cached for display.
   */
  huggingface?: { token?: string; user?: string };
};

export type CortexConfig = {
  services: Service[];
  system?: SystemConfig;
  integrations?: Integrations;
};

/**
 * Load Cortex configuration at runtime (server-side only).
 *
 * Resolution order:
 *   1. cortex-config.json          — your machine's config (gitignored, never committed)
 *   2. cortex-config.example.json  — the shipped template/default
 *
 * Read per call so edits to cortex-config.json apply on the next request without a
 * rebuild. To customize: `cp cortex-config.example.json cortex-config.json` and edit.
 */
export function loadConfig(): CortexConfig {
  const root = process.cwd();
  const candidates = [
    path.join(root, "cortex-config.json"),
    path.join(root, "cortex-config.example.json"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, "utf8")) as CortexConfig;
      }
    } catch {
      // malformed or unreadable — try the next candidate
    }
  }
  return { services: [] };
}

export function getServices(): Service[] {
  return loadConfig().services ?? [];
}

/** System-action config (privileged UI actions). All flags default OFF. */
export function getSystemConfig(): Required<SystemConfig> {
  const sys = loadConfig().system ?? {};
  return {
    ollamaUpdate: sys.ollamaUpdate === true,
    toolInstall: sys.toolInstall === true,
    tailscale: sys.tailscale === true,
    ollamaConfig: sys.ollamaConfig === true,
    cortexUpdate: sys.cortexUpdate === true,
  };
}

/**
 * Persist the full Cortex config to cortex-config.json (the runtime config).
 * The file can hold secrets (API tokens), so it's written owner-only (0600).
 * The web user owns the file it writes, so it can always read it back.
 */
export function writeConfig(cfg: CortexConfig): void {
  const file = path.join(process.cwd(), "cortex-config.json");
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // best-effort — non-POSIX filesystem or perms-locked; not fatal
  }
}

/**
 * Append a service to cortex-config.json (the runtime config). Used after a
 * tool install so it shows up on the services page. No-op if the id exists.
 */
export function addServiceToConfig(service: Service): void {
  const cfg = loadConfig();
  if (!cfg.services.some((s) => s.id === service.id)) {
    cfg.services.push(service);
  }
  writeConfig(cfg);
}

/** The stored Hugging Face integration ({ token, user }) or null if unset. */
export function getHuggingFace(): { token: string; user?: string } | null {
  const hf = loadConfig().integrations?.huggingface;
  const token = typeof hf?.token === "string" ? hf.token.trim() : "";
  if (!token) return null;
  return { token, user: typeof hf?.user === "string" ? hf.user : undefined };
}

/** Just the HF token (for attaching to outbound HF API calls). */
export function getHuggingFaceToken(): string | null {
  return getHuggingFace()?.token ?? null;
}

/** Set or clear the Hugging Face integration. Pass null to remove it. */
export function setHuggingFace(value: { token: string; user?: string } | null): void {
  const cfg = loadConfig();
  const integrations: Integrations = { ...(cfg.integrations ?? {}) };
  const token = value?.token?.trim();
  if (token) integrations.huggingface = { token, ...(value?.user ? { user: value.user } : {}) };
  else delete integrations.huggingface;
  writeConfig({ ...cfg, integrations });
}
