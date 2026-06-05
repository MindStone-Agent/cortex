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

export type CortexConfig = {
  services: Service[];
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
