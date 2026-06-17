import { NextResponse } from "next/server";
import { getIndex, peekIndex } from "@/app/lib/ollamaLibrary";

export const dynamic = "force-dynamic";

// POST /api/models/refresh?source=ollama
// Force-rebuilds the Ollama library index immediately, bypassing the 24h TTL —
// for when Ollama announces a new model and you want it now. HF has no
// equivalent (it's queried live). See MindStone-Agent/cortex#23.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const source = url.searchParams.get("source") ?? "ollama";
  if (source !== "ollama") {
    return NextResponse.json({ error: "refresh only applies to the ollama source" }, { status: 400 });
  }
  const before = peekIndex().total;
  try {
    const idx = await getIndex({ force: true });
    return NextResponse.json({
      ok: true,
      total: idx.entries.length,
      added: Math.max(0, idx.entries.length - before),
      syncedAt: idx.syncedAt,
      indexSource: idx.source,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
