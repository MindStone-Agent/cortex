// Shared types for the Models browser (discover + pull uninstalled models).
// See MindStone-Agent/cortex#23.

export type ModelSource = "ollama" | "hf";

/** A model surfaced in the browse/search results (not necessarily installed). */
export type BrowseModel = {
  source: ModelSource;
  /** ollama: "llama3.1" · hf: "owner/Repo-GGUF" */
  id: string;
  name: string;
  description: string;
  /** ollama capability pills (tools/thinking/vision/embedding) · hf: derived subset */
  capabilities: string[];
  /** ollama parameter sizes ("8b","70b") · hf: [] */
  sizes: string[];
  /** ollama human-readable pull count ("116M") */
  pulls?: string;
  /** hf downloads */
  downloads?: number;
  /** hf likes */
  likes?: number;
  /** ollama "1 year ago" */
  updated?: string;
  /** canonical web page for the model */
  url: string;
};

export type SearchResponse = {
  source: ModelSource;
  query: string;
  results: BrowseModel[];
  /** opaque cursor for the next page; pass back as ?cursor=. null = no more. */
  nextCursor: string | null;
  /** ollama index freshness (epoch ms) */
  syncedAt?: number;
  /** ollama index provenance */
  indexSource?: "scrape" | "fallback";
  /** ollama total matches in the index */
  total?: number;
  error?: string;
};

/** A concrete pullable variant of a model. */
export type ModelVariant = {
  /** full ollama pull ref: "llama3.1:8b" | "hf.co/owner/repo:Q4_K_M" */
  ref: string;
  /** "8b" | "latest" | "Q4_K_M" */
  label: string;
  /** optional extra detail (e.g. source filename) */
  detail?: string;
};

export type DetailResponse = {
  source: ModelSource;
  id: string;
  variants: ModelVariant[];
  error?: string;
};

/** One SSE frame from /api/models/pull. */
export type PullProgress = {
  status?: string;
  completed?: number;
  total?: number;
  error?: string;
  done?: boolean;
};
