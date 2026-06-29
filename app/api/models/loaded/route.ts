// Lightweight loaded-models poll: just Ollama's /api/ps (no per-model /api/show),
// so the dashboard can refresh which models are resident — and their keep-alive —
// every few seconds without the cost of the full /api/models call.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PsItem = { name: string; size_vram?: number; expires_at?: string };

export async function GET() {
  try {
    const res = await fetch("http://localhost:11434/api/ps", {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return NextResponse.json({ loaded: [] });
    const json = (await res.json()) as { models?: PsItem[] };
    const loaded = (json.models ?? []).map((m) => ({
      name: m.name,
      sizeVramBytes: m.size_vram ?? 0,
      expiresAt: m.expires_at ?? null,
    }));
    return NextResponse.json({ loaded });
  } catch {
    return NextResponse.json({ loaded: [] });
  }
}
