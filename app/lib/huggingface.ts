// Hugging Face model search (live, official API) + GGUF variant listing.
// HF can't be pre-indexed (184k+ GGUF repos), so we query it per request and
// paginate via the `Link: …; rel="next"` cursor header. Ollama pulls HF GGUFs
// directly via `hf.co/{repo}:{quant}`. See MindStone-Agent/cortex#23.

import type { BrowseModel, ModelVariant } from "./modelTypes";
import { getHuggingFaceToken } from "./config";

const HF = "https://huggingface.co";

// Server-side request headers — attach the configured HF token (if any) so
// gated/private repos and higher rate limits become available. The token never
// leaves the server; these helpers run only inside API routes.
function hfHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getHuggingFaceToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

type HFModel = {
  id: string;
  modelId?: string;
  likes?: number;
  downloads?: number;
  tags?: string[];
  pipeline_tag?: string;
  createdAt?: string;
};

const NOISE_TAGS = new Set([
  "gguf", "region:us", "endpoints_compatible", "conversational", "autotrain_compatible",
  "imatrix", "text-generation-inference", "transformers", "safetensors",
]);

function shortDescription(m: HFModel): string {
  const bits: string[] = [];
  if (m.pipeline_tag) bits.push(m.pipeline_tag.replace(/-/g, " "));
  const topical = (m.tags ?? []).filter(
    (t) => !t.includes(":") && !NOISE_TAGS.has(t) && !/^[a-z]{2}$/.test(t),
  );
  if (topical.length) bits.push(topical.slice(0, 4).join(", "));
  return bits.join(" · ") || "GGUF model";
}

function capsFromTags(m: HFModel): string[] {
  const t = m.tags ?? [];
  const caps: string[] = [];
  if (
    t.some((x) => ["vision", "multimodal", "image-text-to-text"].includes(x)) ||
    m.pipeline_tag === "image-text-to-text"
  )
    caps.push("vision");
  if (t.includes("moe")) caps.push("moe");
  if (m.pipeline_tag === "sentence-similarity" || m.pipeline_tag === "feature-extraction" || /embed/i.test(m.id))
    caps.push("embedding");
  return caps;
}

function parseNextLink(link: string | null): string | null {
  if (!link) return null;
  const m = link.match(/<([^>]+)>;\s*rel="next"/);
  return m ? m[1] : null;
}

/** Search HF for GGUF models. `cursor` (from a prior nextCursor) loads the next page. */
export async function searchHF(
  q: string,
  cursor: string | null,
): Promise<{ results: BrowseModel[]; nextCursor: string | null }> {
  const url =
    cursor ??
    `${HF}/api/models?filter=gguf&search=${encodeURIComponent(q)}&sort=downloads&direction=-1&limit=24`;
  const res = await fetch(url, {
    headers: hfHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`huggingface HTTP ${res.status}`);
  const arr = (await res.json()) as HFModel[];
  const results: BrowseModel[] = arr.map((m) => ({
    source: "hf",
    id: m.id,
    name: m.id,
    description: shortDescription(m),
    capabilities: capsFromTags(m),
    sizes: [],
    downloads: m.downloads ?? 0,
    likes: m.likes ?? 0,
    url: `${HF}/${m.id}`,
  }));
  return { results, nextCursor: parseNextLink(res.headers.get("link")) };
}

function extractQuant(filename: string): string | null {
  const base = filename.replace(/\.gguf$/i, "").replace(/-\d{5}-of-\d{5}$/i, "");
  const m = base.match(/((?:IQ|Q)\d+(?:_[A-Za-z0-9]+)*|BF16|F16|F32)$/i);
  if (m) return m[1].toUpperCase();
  const seg = base.split(/[-.]/).pop();
  return seg || null;
}

function quantRank(label: string): number {
  const m = label.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 99;
}

/** List the distinct GGUF quant variants in an HF repo as pullable refs. */
export async function hfVariants(repo: string): Promise<ModelVariant[]> {
  const res = await fetch(`${HF}/api/models/${repo}`, {
    headers: hfHeaders(),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`huggingface HTTP ${res.status}`);
  const data = (await res.json()) as { siblings?: { rfilename: string }[] };
  const files = (data.siblings ?? [])
    .map((s) => s.rfilename)
    .filter((f) => f.toLowerCase().endsWith(".gguf"));
  const seen = new Set<string>();
  const variants: ModelVariant[] = [];
  for (const f of files) {
    const quant = extractQuant(f);
    if (!quant || seen.has(quant)) continue;
    seen.add(quant);
    variants.push({ ref: `hf.co/${repo}:${quant}`, label: quant, detail: f });
  }
  variants.sort((a, b) => quantRank(a.label) - quantRank(b.label));
  return variants;
}
