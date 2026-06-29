// Ollama server settings: cloud API key, default context length, default
// keep-alive. Cortex stores these in a managed env file (app/lib/ollamaEnv.ts);
// applying them restarts Ollama via a root-owned NO-ARG wrapper so nothing
// user-controlled reaches root. Gated behind system.ollamaConfig (opt-in).
//
//   GET  → current values + cloud account + whether apply is wired up
//   POST { apiKey?, contextLength?, keepAlive?, restart? }
//          (null clears a field; undefined leaves it; restart applies via wrapper)

import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { getSystemConfig } from "@/app/lib/config";
import { readOllamaEnv, writeOllamaEnv, type OllamaEnv } from "@/app/lib/ollamaEnv";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

// Root-owned, no-arg wrapper installed by scripts/enable-ollama-config.sh.
const RESTART_WRAPPER = "/usr/local/bin/cortex-ollama-restart.sh";

async function ollamaVersion(): Promise<string | null> {
  try {
    const res = await fetch("http://localhost:11434/api/version", {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

// Best-effort: resolve a cloud API key to an account label. Degrades silently if
// the endpoint shape changes or the network is unavailable — purely cosmetic.
async function cloudAccount(apiKey: string): Promise<string | null> {
  try {
    const res = await fetch("https://ollama.com/api/me", {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { name?: string; username?: string; email?: string };
    return j.name || j.username || j.email || "authenticated";
  } catch {
    return null;
  }
}

export async function GET() {
  const sys = getSystemConfig();
  const env = readOllamaEnv();
  const [version, account] = await Promise.all([
    ollamaVersion(),
    env.apiKey ? cloudAccount(env.apiKey) : Promise.resolve(null),
  ]);
  return NextResponse.json({
    version,
    apiKeySet: Boolean(env.apiKey),
    account,
    contextLength: env.contextLength ?? null,
    keepAlive: env.keepAlive ?? null,
    systemActionsEnabled: sys.ollamaConfig,
    applyAvailable: existsSync(RESTART_WRAPPER),
  });
}

const API_KEY_RE = /^[A-Za-z0-9._-]{8,512}$/;
const KEEP_ALIVE_RE = /^(-1|\d+(\.\d+)?(ms|s|m|h)?)$/;

export async function POST(req: Request) {
  const sys = getSystemConfig();
  if (!sys.ollamaConfig) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "UI-driven Ollama settings are disabled. Run scripts/enable-ollama-config.sh, " +
          'then set "system": { "ollamaConfig": true } in cortex-config.json and restart Cortex.',
      },
      { status: 403 }
    );
  }

  let body: {
    apiKey?: unknown;
    contextLength?: unknown;
    keepAlive?: unknown;
    restart?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const next: OllamaEnv = { ...readOllamaEnv() };

  // apiKey: string = set (validated), null = clear, undefined = leave
  if (body.apiKey === null) {
    delete next.apiKey;
  } else if (typeof body.apiKey === "string") {
    const k = body.apiKey.trim();
    if (!API_KEY_RE.test(k)) {
      return NextResponse.json({ ok: false, error: "invalid API key format" }, { status: 400 });
    }
    next.apiKey = k;
  }

  // contextLength: number = set, null = clear, undefined = leave
  if (body.contextLength === null) {
    delete next.contextLength;
  } else if (body.contextLength !== undefined) {
    const n = Number(body.contextLength);
    if (!Number.isInteger(n) || n < 256 || n > 2_000_000) {
      return NextResponse.json(
        { ok: false, error: "contextLength must be an integer between 256 and 2000000" },
        { status: 400 }
      );
    }
    next.contextLength = n;
  }

  // keepAlive: string = set (validated), null = clear, undefined = leave
  if (body.keepAlive === null) {
    delete next.keepAlive;
  } else if (typeof body.keepAlive === "string") {
    const v = body.keepAlive.trim();
    if (!KEEP_ALIVE_RE.test(v)) {
      return NextResponse.json(
        { ok: false, error: "keepAlive must be a duration like 5m, 30s, 0, or -1" },
        { status: 400 }
      );
    }
    next.keepAlive = v;
  }

  try {
    writeOllamaEnv(next);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `failed to write Ollama env: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }

  let restarted = false;
  if (body.restart === true) {
    if (!existsSync(RESTART_WRAPPER)) {
      return NextResponse.json(
        {
          ok: true,
          saved: true,
          restarted: false,
          error: "Saved, but the restart wrapper is not installed — run scripts/enable-ollama-config.sh.",
        },
        { status: 200 }
      );
    }
    try {
      await execAsync(`sudo -n ${RESTART_WRAPPER}`, { timeout: 60_000 });
      restarted = true;
    } catch (e) {
      const err = e as { stderr?: string; message?: string };
      return NextResponse.json(
        {
          ok: true,
          saved: true,
          restarted: false,
          error: `Saved, but restart failed: ${(err.stderr || err.message || "unknown").slice(-500)}`,
        },
        { status: 200 }
      );
    }
  }

  return NextResponse.json({ ok: true, saved: true, restarted });
}
