// Contained Ollama runtimes (cortex-config.json `containedOllama`): models served by an
// Ollama inside a container with no host port. This route only READS the snapshot files
// that scripts/cortex-contained-ollama.py writes; the web process never talks to Docker.

import { NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getContainedOllama } from "@/app/lib/config";

export const dynamic = "force-dynamic";

// The collector writes every ~3 s; older than this means it isn't running.
const STALE_MS = 15_000;

type Snapshot = {
  checkedAt?: number;
  ok?: boolean;
  error?: string | null;
  loaded?: { name: string; size: string; processor: string; context: string; until: string }[];
  models?: { name: string; size: string }[];
};

const str = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : "");

export async function GET() {
  const dir = process.env.CORTEX_CONTAINED_DIR || path.join(os.homedir(), ".cache", "cortex", "contained");
  const now = Date.now();
  const runtimes = getContainedOllama().map((c) => {
    let snap: Snapshot | null = null;
    try {
      snap = JSON.parse(fs.readFileSync(path.join(dir, `${c.id}.json`), "utf8")) as Snapshot;
    } catch {
      snap = null;
    }
    const checkedAt = typeof snap?.checkedAt === "number" ? snap.checkedAt * 1000 : null;
    return {
      id: c.id,
      label: c.label,
      container: c.container,
      note: c.note ?? null,
      checkedAt: checkedAt ? new Date(checkedAt).toISOString() : null,
      stale: checkedAt === null || now - checkedAt > STALE_MS,
      ok: snap?.ok === true,
      error: snap ? str(snap.error, 200) || null : "no snapshot yet: is cortex-contained-ollama running?",
      loaded: (snap?.loaded ?? []).slice(0, 50).map((m) => ({
        name: str(m.name), size: str(m.size, 20), processor: str(m.processor, 30),
        context: str(m.context, 20), until: str(m.until, 40),
      })),
      models: (snap?.models ?? []).slice(0, 200).map((m) => ({ name: str(m.name), size: str(m.size, 20) })),
    };
  });
  return NextResponse.json({ runtimes });
}
