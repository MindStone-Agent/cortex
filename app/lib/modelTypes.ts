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
  /** ollama: model has at least one Ollama Cloud variant */
  cloud?: boolean;
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

/**
 * Whether this box can actually run Ollama Cloud models. Derived from the local
 * Ollama server's registered *device* key (`POST /api/me`) — NOT from whether an
 * OLLAMA_API_KEY is set, which proves registry access but not inference access.
 * See app/lib/ollamaCloud.ts.
 */
export type CloudAuth = {
  signedIn: boolean;
  /** Account label (email preferred) when signed in. */
  account?: string;
  /** Ollama plan tier, when reported. */
  plan?: string;
  /** The local Ollama server could not be reached at all. */
  unreachable?: boolean;
};

/** A concrete pullable variant of a model. */
export type ModelVariant = {
  /** full ollama pull ref: "llama3.1:8b" | "hf.co/owner/repo:Q4_K_M" */
  ref: string;
  /** "8b" | "latest" | "Q4_K_M" | "cloud" | "120b-cloud" */
  label: string;
  /** optional extra detail (e.g. source filename) */
  detail?: string;
  /** Ollama Cloud variant: installs a pointer, runs remotely, needs cloud auth. */
  cloud?: boolean;
};

export type DetailResponse = {
  source: ModelSource;
  id: string;
  variants: ModelVariant[];
  /** Present when the response includes cloud variants — gates the cloud pills. */
  cloudAuth?: CloudAuth;
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
