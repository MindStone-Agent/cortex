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
  side: "mindstone" | "nvidia";
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
};

export type CortexConfig = {
  services: Service[];
  system?: SystemConfig;
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
  };
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
  fs.writeFileSync(
    path.join(process.cwd(), "cortex-config.json"),
    JSON.stringify(cfg, null, 2) + "\n",
    "utf8"
  );
}
