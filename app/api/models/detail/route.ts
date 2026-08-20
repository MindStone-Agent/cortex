import { NextResponse } from "next/server";
import { ollamaVariants } from "@/app/lib/ollamaLibrary";
import { cloudInfo, getCloudAuth } from "@/app/lib/ollamaCloud";
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
    if (source === "hf") {
      const body: DetailResponse = { source, id, variants: await hfVariants(id) };
      return NextResponse.json(body);
    }

    // Local sizes come from the cached library index; cloud tags are scraped
    // lazily and only for models already known to be cloud-capable.
    const [local, cloud] = await Promise.all([ollamaVariants(id), cloudInfo(id)]);
    // Cloud-native models publish no `latest`, which the index can't tell us —
    // drop the pill rather than offer a pull that 404s. Only when we actually
    // know (hasLatest === false); an unknown leaves the list untouched.
    const localVariants =
      cloud.hasLatest === false ? local.filter((v) => v.ref !== id) : local;

    const body: DetailResponse = { source, id, variants: [...localVariants, ...cloud.variants] };
    // Only report auth when there is something for it to gate, so the common
    // (non-cloud) card costs no extra call.
    if (cloud.variants.length) body.cloudAuth = await getCloudAuth();
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
