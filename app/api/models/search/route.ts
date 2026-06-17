import { NextResponse } from "next/server";
import { searchOllama } from "@/app/lib/ollamaLibrary";
import { searchHF } from "@/app/lib/huggingface";
import type { SearchResponse } from "@/app/lib/modelTypes";

export const dynamic = "force-dynamic";

// GET /api/models/search?source=ollama|hf&q=<query>&cursor=<opaque>
export async function GET(req: Request) {
  const url = new URL(req.url);
  const source = url.searchParams.get("source") === "hf" ? "hf" : "ollama";
  const q = url.searchParams.get("q") ?? "";
  const cursor = url.searchParams.get("cursor");

  try {
    if (source === "hf") {
      const { results, nextCursor } = await searchHF(q, cursor);
      const body: SearchResponse = { source, query: q, results, nextCursor };
      return NextResponse.json(body);
    }
    const page = cursor ? parseInt(cursor, 10) || 0 : 0;
    const { results, total, hasMore, syncedAt, source: indexSource } = await searchOllama(q, page);
    const body: SearchResponse = {
      source: "ollama",
      query: q,
      results,
      nextCursor: hasMore ? String(page + 1) : null,
      syncedAt,
      indexSource,
      total,
    };
    return NextResponse.json(body);
  } catch (e) {
    const body: SearchResponse = {
      source,
      query: q,
      results: [],
      nextCursor: null,
      error: e instanceof Error ? e.message : String(e),
    };
    return NextResponse.json(body, { status: 502 });
  }
}
