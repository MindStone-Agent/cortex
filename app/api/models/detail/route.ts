import { NextResponse } from "next/server";
import { ollamaVariants } from "@/app/lib/ollamaLibrary";
import { hfVariants } from "@/app/lib/huggingface";
import type { DetailResponse } from "@/app/lib/modelTypes";

export const dynamic = "force-dynamic";

// GET /api/models/detail?source=ollama|hf&id=<model id>
// Lazily fetched on card-open to list pullable variants (quants / sizes).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const source = url.searchParams.get("source") === "hf" ? "hf" : "ollama";
  const id = url.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const variants = source === "hf" ? await hfVariants(id) : await ollamaVariants(id);
    const body: DetailResponse = { source, id, variants };
    return NextResponse.json(body);
  } catch (e) {
    const body: DetailResponse = {
      source,
      id,
      variants: [],
      error: e instanceof Error ? e.message : String(e),
    };
    return NextResponse.json(body, { status: 502 });
  }
}
