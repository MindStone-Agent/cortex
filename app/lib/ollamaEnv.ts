// Cortex-managed Ollama server environment.
//
// Cortex writes a small env file (KEY=VALUE lines) that it owns. On Linux/systemd
// deployments, scripts/enable-ollama-config.sh adds an `EnvironmentFile=-<path>`
// drop-in to the ollama unit so these values reach the Ollama server on restart.
// Nothing here is deployment-specific: the path resolves from $HOME (XDG) and can
// be overridden with CORTEX_OLLAMA_ENV_FILE for non-default layouts (Docker, a
// system service running as the `ollama` user, etc.).
//
// Only these three keys are managed; the file is otherwise left alone so an admin
// can add their own lines without Cortex clobbering them.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type OllamaEnv = {
  apiKey?: string;
  contextLength?: number;
  keepAlive?: string;
};

/**
 * Resolve the managed env-file path:
 *   1. CORTEX_OLLAMA_ENV_FILE (explicit override)
 *   2. /etc/cortex/ollama.env when present (installed by enable-ollama-config.sh;
 *      readable by the Ollama service user)
 *   3. $HOME/.config/cortex/ollama.env (dev / not-yet-enabled fallback)
 */
export function ollamaEnvPath(): string {
  if (process.env.CORTEX_OLLAMA_ENV_FILE) return process.env.CORTEX_OLLAMA_ENV_FILE;
  const systemPath = "/etc/cortex/ollama.env";
  try {
    if (fs.existsSync(systemPath)) return systemPath;
  } catch {
    /* fall through to home path */
  }
  return path.join(os.homedir(), ".config", "cortex", "ollama.env");
}

function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** Read Cortex's managed Ollama env values. Missing file → empty. */
export function readOllamaEnv(): OllamaEnv {
  try {
    const m = parseEnvFile(fs.readFileSync(ollamaEnvPath(), "utf8"));
    const ctxRaw = m.OLLAMA_CONTEXT_LENGTH;
    const ctx = ctxRaw ? parseInt(ctxRaw, 10) : NaN;
    return {
      apiKey: m.OLLAMA_API_KEY || undefined,
      contextLength: Number.isFinite(ctx) ? ctx : undefined,
      keepAlive: m.OLLAMA_KEEP_ALIVE || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Overwrite the managed env file with the given values (omitted keys are dropped).
 * Preserves the file's existing permissions/ownership when it already exists (so the
 * enable script can set, e.g., 640 cortex:ollama); on first creation it falls back
 * to owner-only 600 since the file can hold the cloud API key.
 */
export function writeOllamaEnv(next: OllamaEnv): void {
  const file = ollamaEnvPath();
  const existed = fs.existsSync(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const lines = [
    "# Managed by Cortex (Settings -> Ollama). Fed to the Ollama service via a",
    "# systemd EnvironmentFile drop-in; edits apply on the next Ollama restart.",
  ];
  if (next.apiKey) lines.push(`OLLAMA_API_KEY=${next.apiKey}`);
  if (next.contextLength != null) lines.push(`OLLAMA_CONTEXT_LENGTH=${next.contextLength}`);
  if (next.keepAlive) lines.push(`OLLAMA_KEEP_ALIVE=${next.keepAlive}`);

  fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
  if (!existed) {
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      // best-effort on non-POSIX filesystems
    }
  }
}
