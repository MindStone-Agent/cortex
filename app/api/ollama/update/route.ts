import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { getSystemConfig } from "@/app/lib/config";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

/**
 * The ONE privileged action the UI can trigger. A pinned, root-owned wrapper that
 * takes NO arguments — nothing user-controlled ever reaches root. Install + grant
 * scoped passwordless sudo via scripts/enable-ollama-update.sh.
 */
const UPDATE_WRAPPER = "/usr/local/bin/cortex-ollama-update.sh";

function parseSemver(v: string): number[] {
  return v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
}

function isNewer(latest: string, installed: string): boolean {
  const a = parseSemver(latest);
  const b = parseSemver(installed);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function installedVersion(): Promise<string | null> {
  try {
    const res = await fetch("http://localhost:11434/api/version", {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { version?: string };
    return j.version ?? null;
  } catch {
    return null;
  }
}

async function latestRelease(): Promise<{ version: string | null; url: string | null }> {
  try {
    const res = await fetch("https://api.github.com/repos/ollama/ollama/releases/latest", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/vnd.github+json", "User-Agent": "cortex-dashboard" },
    });
    if (!res.ok) return { version: null, url: null };
    const j = (await res.json()) as { tag_name?: string; html_url?: string };
    return {
      version: j.tag_name ? j.tag_name.replace(/^v/, "") : null,
      url: j.html_url ?? null,
    };
  } catch {
    return { version: null, url: null };
  }
}

// GET — check for an update. Read-only, no privileges required.
export async function GET() {
  const sys = getSystemConfig();
  const [installed, latest] = await Promise.all([installedVersion(), latestRelease()]);
  const updateAvailable = Boolean(
    installed && latest.version && isNewer(latest.version, installed)
  );
  return NextResponse.json({
    installed,
    latest: latest.version,
    releaseUrl: latest.url,
    updateAvailable,
    systemActionsEnabled: sys.ollamaUpdate,
  });
}

// POST — apply the update + restart Ollama. Gated behind the opt-in config flag
// AND the scoped sudoers rule (sudo -n fails closed if the rule isn't present).
export async function POST() {
  const sys = getSystemConfig();
  if (!sys.ollamaUpdate) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "UI-driven Ollama updates are disabled. Run scripts/enable-ollama-update.sh, " +
          'then set "system": { "ollamaUpdate": true } in cortex-config.json and restart Cortex.',
      },
      { status: 403 }
    );
  }
  try {
    // No interpolation: UPDATE_WRAPPER is a hardcoded constant and takes no args.
    const { stdout, stderr } = await execAsync(`sudo -n ${UPDATE_WRAPPER}`, {
      timeout: 180_000,
    });
    return NextResponse.json({ ok: true, output: `${stdout}\n${stderr}`.trim().slice(-4000) });
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    return NextResponse.json(
      { ok: false, error: (err.stderr || err.message || "update failed").slice(-2000) },
      { status: 500 }
    );
  }
}
