// Ollama library index: scrape ollama.com/library once, cache it (24h TTL +
// stale-while-revalidate + manual force-refresh), and search/paginate the
// cache. Ollama has no official library search API, so we parse the page's
// stable `x-test-*` attributes. A small bundled catalog is the fallback when a
// scrape fails. See MindStone-Agent/cortex#23.

import type { BrowseModel, ModelVariant } from "./modelTypes";
import { getCloudModels } from "./ollamaCloud";

const LIBRARY_URL = "https://ollama.com/library";
const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PAGE_SIZE = 24;
const MIN_PLAUSIBLE = 10; // fewer than this parsed ⇒ treat as a markup change / failure

export type LibEntry = {
  name: string;
  description: string;
  capabilities: string[];
  sizes: string[];
  pulls: string;
  updated: string;
};

type Index = { entries: LibEntry[]; syncedAt: number; source: "scrape" | "fallback" };

// Module-level cache (per server process). Persists across requests.
let cache: Index | null = null;
let refreshing: Promise<Index> | null = null;

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstGroup(block: string, re: RegExp): string {
  const m = block.match(re);
  return m ? stripTags(m[1]) : "";
}

/**
 * Parse via the `x-test-*` anchors. Ollama shipped these for their own test
 * suite and removed them from /library some time before 2026-08-03; kept as the
 * preferred path because it is far more stable than styling when it is present.
 */
function parseByTestAnchors(html: string): LibEntry[] {
  const blocks = html.split("<li x-test-model").slice(1);
  const out: LibEntry[] = [];
  for (const b of blocks) {
    const nameMatch = b.match(/href="\/library\/([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const description = firstGroup(b, /<p[^>]*>([\s\S]*?)<\/p>/);
    const capabilities = [...b.matchAll(/x-test-capability[^>]*>([\s\S]*?)<\/span>/g)]
      .map((m) => stripTags(m[1]))
      .filter(Boolean);
    const sizes = [...b.matchAll(/x-test-size[^>]*>([\s\S]*?)<\/span>/g)]
      .map((m) => stripTags(m[1]))
      .filter(Boolean);
    const pulls = firstGroup(b, /x-test-pull-count[^>]*>([\s\S]*?)<\/span>/);
    const updated = firstGroup(b, /x-test-updated[^>]*>([\s\S]*?)<\/span>/);
    out.push({ name, description, capabilities, sizes, pulls, updated });
  }
  return out;
}

/**
 * Parse the current (post-x-test) markup. Each model is an `<li>` wrapping an
 * `<a href="/library/NAME">`; capability and size pills are distinguished only
 * by their Tailwind background — capabilities are `bg-indigo-50`, sizes are
 * `bg-[#ddf4ff]`. Pull count and last-updated live in a trailing metadata `<p>`
 * as bare `<span>`s next to the literals "Pulls" / "ago", which is what we
 * anchor on rather than span order.
 */
function parseByStructure(html: string): LibEntry[] {
  const blocks = html.split(/<li\b/).slice(1);
  const out: LibEntry[] = [];
  for (const b of blocks) {
    const nameMatch = b.match(/href="\/library\/([^"#?]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const description = firstGroup(b, /<p[^>]*class="[^"]*max-w-lg[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const capabilities = [...b.matchAll(/<span[^>]*bg-indigo-50[^>]*>([\s\S]*?)<\/span>/g)]
      .map((m) => stripTags(m[1]))
      .filter(Boolean);
    const sizes = [...b.matchAll(/<span[^>]*bg-\[#ddf4ff\][^>]*>([\s\S]*?)<\/span>/g)]
      .map((m) => stripTags(m[1]))
      .filter(Boolean);
    // "<span >118M</span> <span ...>&nbsp;Pulls</span>" — take the value that
    // precedes the Pulls label, not the first span in the metadata block.
    const pulls = firstGroup(b, /<span[^>]*>([^<]*?)<\/span>\s*<span[^>]*>(?:&nbsp;|\s)*Pulls</);
    const updated = firstGroup(b, /<span[^>]*>([^<]*?\bago)\s*<\/span>/);
    out.push({ name, description, capabilities, sizes, pulls, updated });
  }
  return out;
}

/**
 * Parse the library HTML into entries. Tries the `x-test-*` anchors first and
 * falls back to structural parsing, so an upstream markup change in either
 * direction degrades to the other rather than to an empty catalog.
 */
export function parseLibrary(html: string): LibEntry[] {
  const byAnchors = parseByTestAnchors(html);
  if (byAnchors.length >= MIN_PLAUSIBLE) return byAnchors;
  const byStructure = parseByStructure(html);
  return byStructure.length >= byAnchors.length ? byStructure : byAnchors;
}

async function scrape(): Promise<Index> {
  const res = await fetch(LIBRARY_URL, {
    headers: { "User-Agent": "Cortex (+https://github.com/MindStone-Agent/cortex)" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`ollama.com/library HTTP ${res.status}`);
  const html = await res.text();
  const entries = parseLibrary(html);
  if (entries.length < MIN_PLAUSIBLE) {
    throw new Error(`parsed only ${entries.length} models — library markup may have changed`);
  }
  return { entries, syncedAt: Date.now(), source: "scrape" };
}

function fallbackIndex(): Index {
  return { entries: FALLBACK_CATALOG, syncedAt: Date.now(), source: "fallback" };
}

async function refresh(): Promise<Index> {
  if (refreshing) return refreshing;
  refreshing = scrape()
    .then((idx) => {
      cache = idx;
      return idx;
    })
    .catch((err) => {
      if (!cache) cache = fallbackIndex();
      throw err;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Get the index, honoring TTL + stale-while-revalidate. `force` re-scrapes now
 * and *propagates* a scrape failure: the caller explicitly asked for fresh data,
 * so swallowing the error here would report success while serving the stale
 * catalog — which is exactly how a broken scrape stayed invisible for weeks.
 * Non-forced reads still degrade quietly, since a page render should never fail
 * just because ollama.com is unreachable.
 */
export async function getIndex(opts?: { force?: boolean }): Promise<Index> {
  const force = opts?.force ?? false;
  if (force) return refresh();
  if (!cache) {
    try {
      return await refresh();
    } catch {
      return cache ?? fallbackIndex();
    }
  }
  if (Date.now() - cache.syncedAt > TTL_MS && !refreshing) {
    // Stale: kick a background refresh, serve the stale copy now.
    void refresh().catch(() => {});
  }
  return cache;
}

/** Current cache stats without triggering a fetch (for the refresh delta). */
export function peekIndex(): { total: number; syncedAt: number | null } {
  return { total: cache?.entries.length ?? 0, syncedAt: cache?.syncedAt ?? null };
}

export async function searchOllama(
  q: string,
  page: number,
): Promise<{
  results: BrowseModel[];
  total: number;
  hasMore: boolean;
  syncedAt: number;
  source: "scrape" | "fallback";
}> {
  // Cloud membership only badges the card; a failed cloud lookup degrades to an
  // empty set and must never fail the search itself.
  const [idx, cloud] = await Promise.all([getIndex(), getCloudModels()]);
  const query = q.trim().toLowerCase();
  let entries = idx.entries;
  if (query) {
    entries = entries.filter(
      (e) =>
        e.name.toLowerCase().includes(query) ||
        e.description.toLowerCase().includes(query) ||
        e.capabilities.some((c) => c.toLowerCase().includes(query)),
    );
  }
  const total = entries.length;
  const start = Math.max(0, page) * PAGE_SIZE;
  const results: BrowseModel[] = entries.slice(start, start + PAGE_SIZE).map((e) => ({
    source: "ollama",
    id: e.name,
    name: e.name,
    description: e.description,
    capabilities: e.capabilities,
    sizes: e.sizes,
    pulls: e.pulls,
    updated: e.updated,
    cloud: cloud.names.has(e.name),
    url: `https://ollama.com/library/${e.name}`,
  }));
  return { results, total, hasMore: start + PAGE_SIZE < total, syncedAt: idx.syncedAt, source: idx.source };
}

/** Pullable variants for an Ollama library model: its parameter sizes + latest. */
export async function ollamaVariants(name: string): Promise<ModelVariant[]> {
  const idx = await getIndex();
  const entry = idx.entries.find((e) => e.name === name);
  const variants: ModelVariant[] = [{ ref: name, label: "latest" }];
  for (const s of entry?.sizes ?? []) {
    const ref = `${name}:${s}`;
    if (!variants.some((v) => v.ref === ref)) variants.push({ ref, label: s });
  }
  return variants;
}

// A minimal bundled catalog so the page is never empty if a scrape fails.
const FALLBACK_CATALOG: LibEntry[] = [
  { name: "llama3.1", description: "Meta's Llama 3.1, 8B–405B.", capabilities: ["tools"], sizes: ["8b", "70b", "405b"], pulls: "", updated: "" },
  { name: "llama3.2", description: "Meta's Llama 3.2, small + vision.", capabilities: ["tools", "vision"], sizes: ["1b", "3b", "11b", "90b"], pulls: "", updated: "" },
  { name: "qwen2.5", description: "Alibaba's Qwen2.5 series.", capabilities: ["tools"], sizes: ["0.5b", "1.5b", "3b", "7b", "14b", "32b", "72b"], pulls: "", updated: "" },
  { name: "qwen2.5-coder", description: "Code-specialized Qwen2.5.", capabilities: ["tools"], sizes: ["1.5b", "7b", "32b"], pulls: "", updated: "" },
  { name: "deepseek-r1", description: "Open reasoning models.", capabilities: ["tools", "thinking"], sizes: ["1.5b", "7b", "8b", "14b", "32b", "70b", "671b"], pulls: "", updated: "" },
  { name: "gemma2", description: "Google's Gemma 2.", capabilities: [], sizes: ["2b", "9b", "27b"], pulls: "", updated: "" },
  { name: "phi4", description: "Microsoft's Phi-4.", capabilities: [], sizes: ["14b"], pulls: "", updated: "" },
  { name: "mistral", description: "Mistral 7B.", capabilities: ["tools"], sizes: ["7b"], pulls: "", updated: "" },
  { name: "mixtral", description: "Mistral MoE.", capabilities: ["tools"], sizes: ["8x7b", "8x22b"], pulls: "", updated: "" },
  { name: "nomic-embed-text", description: "High-performing embedding model.", capabilities: ["embedding"], sizes: [], pulls: "", updated: "" },
  { name: "mxbai-embed-large", description: "State-of-the-art embeddings.", capabilities: ["embedding"], sizes: [], pulls: "", updated: "" },
  { name: "llava", description: "Vision-language model.", capabilities: ["vision"], sizes: ["7b", "13b", "34b"], pulls: "", updated: "" },
  { name: "codellama", description: "Llama for code.", capabilities: [], sizes: ["7b", "13b", "34b", "70b"], pulls: "", updated: "" },
  { name: "llama3.3", description: "Meta's Llama 3.3 70B.", capabilities: ["tools"], sizes: ["70b"], pulls: "", updated: "" },
  { name: "granite3.1-dense", description: "IBM Granite dense models.", capabilities: ["tools"], sizes: ["2b", "8b"], pulls: "", updated: "" },
  { name: "smollm2", description: "Small on-device models.", capabilities: ["tools"], sizes: ["135m", "360m", "1.7b"], pulls: "", updated: "" },
];
