// Cortex self-update.
//   GET  → current version/commit vs origin; whether an update is available.
//   POST → run scripts/cortex-self-update.sh (git pull + build + detached restart).
//
// No root needed for the standard systemd *user* deploy — the web user owns the
// checkout and restarts its own unit. Gated behind system.cortexUpdate (opt-in).
// A failed pull/build aborts before any restart, so a broken build never goes live.

import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getSystemConfig } from "@/app/lib/config";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

function repoRoot(): string {
  return process.cwd();
}

function currentVersion(): string | null {
  try {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot(), "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

async function git(args: string, timeout = 8000): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`git ${args}`, { cwd: repoRoot(), timeout });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function GET() {
  const sys = getSystemConfig();
  const version = currentVersion();
  const currentSha = await git("rev-parse HEAD");
  const branch = await git("rev-parse --abbrev-ref HEAD");
  // ls-remote hits the network but never touches the working tree (read-only).
  let remoteSha: string | null = null;
  if (branch && branch !== "HEAD") {
    const ls = await git(`ls-remote origin refs/heads/${branch}`, 12000);
    remoteSha = ls ? ls.split(/\s+/)[0] || null : null;
  }
  const updateAvailable = Boolean(currentSha && remoteSha && currentSha !== remoteSha);

  return NextResponse.json({
    version,
    branch,
    currentSha: currentSha ? currentSha.slice(0, 7) : null,
    remoteSha: remoteSha ? remoteSha.slice(0, 7) : null,
    updateAvailable,
    systemActionsEnabled: sys.cortexUpdate,
  });
}

export async function POST() {
  const sys = getSystemConfig();
  if (!sys.cortexUpdate) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'UI-driven Cortex updates are disabled. Set "system": { "cortexUpdate": true } in ' +
          "cortex-config.json and restart Cortex. (For non-systemd deploys, also set CORTEX_RESTART_CMD.)",
      },
      { status: 403 }
    );
  }

  const script = path.join(repoRoot(), "scripts", "cortex-self-update.sh");
  try {
    // The script pulls + builds synchronously (output captured here), then
    // schedules a DETACHED restart and exits — so this response returns before
    // the service bounces. A failed build throws and never restarts.
    const { stdout, stderr } = await execAsync(`bash ${script}`, { timeout: 300_000 });
    return NextResponse.json({
      ok: true,
      restarting: true,
      output: `${stdout}\n${stderr}`.trim().slice(-4000),
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return NextResponse.json(
      {
        ok: false,
        restarting: false,
        error: (err.stderr || err.stdout || err.message || "update failed").slice(-2000),
      },
      { status: 500 }
    );
  }
}
