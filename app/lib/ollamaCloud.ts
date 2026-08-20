// Ollama Cloud: which library models have cloud variants, what those variants
// are, and whether this box can actually *run* them. See MindStone-Agent/cortex#41.
//
// Two different credentials are in play, and conflating them is the whole reason
// this module exists:
//
//   - **OLLAMA_API_KEY** (Settings → Ollama) authenticates registry/API calls.
//   - A **device signin key** (`ollama signin`, an ed25519 key in the Ollama
//     server's home) is what cloud model *inference* authenticates with.
//
// A box can have a perfectly valid API key and still fail every cloud run with
// "You need to be signed in" — which is exactly what happened on the DGX Spark
// on 2026-08-17. So "is an API key set?" is NOT a cloud-run capability check.
// The local Ollama server reports its device-key identity at `POST /api/me`;
// that is the honest signal, and it is the only one this module trusts.
//
// Discovery is scraped, because Ollama publishes no library API:
//   - `ollama.com/search?c=cloud`      → the set of cloud-capable models
//   - `ollama.com/library/<name>/tags` → that model's exact cloud tags
// The library index itself does not expose cloud tags, which is why a cloud
// variant can never be derived from the index entry alone.

import type { CloudAuth, ModelVariant } from "./modelTypes";

export type { CloudAuth };

const CLOUD_SEARCH_URL = "https://ollama.com/search?c=cloud";
const OLLAMA = "http://localhost:11434";
const UA = "Cortex (+https://github.com/MindStone-Agent/cortex)";

const TTL_MS = 24 * 60 * 60 * 1000; // 24h, matching the library index
const AUTH_TTL_MS = 30 * 1000; // sign-in state changes rarely, but stays responsive
// The cloud set is genuinely small (~16 models), so the library index's
// "fewer than 10 means the markup broke" floor is far too aggressive here. A
// partial parse still degrades gracefully — those models simply show no cloud
// pills — so we only treat a near-empty parse as a failure.
const MIN_PLAUSIBLE = 3;

type CloudSet = { names: Set<string>; syncedAt: number; ok: boolean };

/** Every tag a model publishes, plus the cloud subset. */
export type ModelTags = { all: string[]; cloud: string[] };

export type CloudInfo = {
  /** Pullable cloud variants; empty when the model has none. */
  variants: ModelVariant[];
  /**
   * Whether the model publishes a plain `latest` tag. `null` means unknown —
   * either the model isn't cloud-capable (we never fetch its tags) or the fetch
   * failed. Callers must treat `null` as "don't change anything".
   */
  hasLatest: boolean | null;
};

let setCache: CloudSet | null = null;
let setRefreshing: Promise<CloudSet> | null = null;
const tagCache = new Map<string, { tags: ModelTags; syncedAt: number }>();
let authCache: { value: CloudAuth; at: number } | null = null;

function collectNames(s: string): string[] {
  const out = new Set<string>();
  // Model links only: no tag (":"), no nested path.
  for (const m of s.matchAll(/href="\/library\/([^"/?#:]+)"/g)) out.add(m[1]);
  return [...out];
}

/**
 * Parse the cloud search page into model names. Prefers links scoped to the
 * results list, falling back to the whole document, so that chrome links added
 * around the grid (or a change to the grid markup) degrades rather than breaks.
 */
export function parseCloudModels(html: string): string[] {
  const scoped = collectNames(html.split(/<li\b/).slice(1).join(" "));
  if (scoped.length >= MIN_PLAUSIBLE) return scoped;
  const all = collectNames(html);
  return all.length > scoped.length ? all : scoped;
}

/**
 * Extract a model's cloud tags from its tags page. Cloud tags are either the
 * bare `cloud` or size-qualified `<size>-cloud` (`gpt-oss:120b-cloud`), so we
 * anchor on that suffix rather than a substring match — `cloudy-7b` is not a
 * cloud tag.
 */
export function parseModelTags(html: string, name: string): ModelTags {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`href="/library/${esc}:([^"?#]+)"`, "g");
  const all = new Set<string>();
  for (const m of html.matchAll(re)) all.add(m[1]);
  const cloud = [...all]
    .filter((t) => /(^|-)cloud$/i.test(t))
    // Bare `cloud` (the default) first, then size-qualified in natural order.
    .sort((a, b) => {
      if (a === "cloud") return -1;
      if (b === "cloud") return 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  return { all: [...all], cloud };
}

/** Cloud tags only — kept as a named helper for readability at call sites. */
export function parseCloudTags(html: string, name: string): string[] {
  return parseModelTags(html, name).cloud;
}

async function scrapeCloudSet(): Promise<CloudSet> {
  const res = await fetch(CLOUD_SEARCH_URL, {
    headers: { "User-Agent": UA },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`ollama.com/search?c=cloud HTTP ${res.status}`);
  const names = parseCloudModels(await res.text());
  if (names.length < MIN_PLAUSIBLE) {
    throw new Error(`parsed only ${names.length} cloud models — markup may have changed`);
  }
  return { names: new Set(names), syncedAt: Date.now(), ok: true };
}

async function refreshCloudSet(): Promise<CloudSet> {
  if (setRefreshing) return setRefreshing;
  setRefreshing = scrapeCloudSet()
    .then((s) => {
      setCache = s;
      return s;
    })
    .finally(() => {
      setRefreshing = null;
    });
  return setRefreshing;
}

/**
 * The set of library models that have a cloud variant (24h cache +
 * stale-while-revalidate). Failures degrade to an empty set rather than
 * throwing: cloud pills are an enhancement, and losing ollama.com must never
 * take down model search or the Pull dropdown.
 */
export async function getCloudModels(opts?: { force?: boolean }): Promise<CloudSet> {
  const force = opts?.force ?? false;
  if (force) {
    try {
      return await refreshCloudSet();
    } catch {
      return setCache ?? { names: new Set(), syncedAt: Date.now(), ok: false };
    }
  }
  if (!setCache) {
    try {
      return await refreshCloudSet();
    } catch {
      return { names: new Set(), syncedAt: Date.now(), ok: false };
    }
  }
  if (Date.now() - setCache.syncedAt > TTL_MS && !setRefreshing) {
    void refreshCloudSet().catch(() => {});
  }
  return setCache;
}

/**
 * A model's published tags, scraped lazily on first ask and cached for 24h.
 * Returns null when the tags page can't be read, so callers can tell "this model
 * has no cloud tags" apart from "we don't know".
 */
export async function getModelTags(name: string): Promise<ModelTags | null> {
  const hit = tagCache.get(name);
  if (hit && Date.now() - hit.syncedAt < TTL_MS) return hit.tags;
  try {
    const res = await fetch(`https://ollama.com/library/${encodeURIComponent(name)}/tags`, {
      headers: { "User-Agent": UA },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`tags HTTP ${res.status}`);
    const tags = parseModelTags(await res.text(), name);
    tagCache.set(name, { tags, syncedAt: Date.now() });
    return tags;
  } catch {
    // Serve a stale hit if we have one; otherwise the caller degrades.
    return hit?.tags ?? null;
  }
}

/** A model's cloud tags (empty if it has none or the lookup failed). */
export async function getCloudTags(name: string): Promise<string[]> {
  return (await getModelTags(name))?.cloud ?? [];
}

/**
 * Cloud variants for a library model, plus whether it publishes a plain
 * `latest`. Only cloud-capable models are looked up, so the per-model tags page
 * is fetched for the ~16 models that can possibly have cloud tags and no others.
 *
 * `hasLatest` exists because cloud-native models (deepseek-v4-flash/pro) publish
 * *only* cloud tags — `deepseek-v4-flash:latest` 404s — while the library index
 * gives no way to know that. Without it the card offers a `latest` pill that
 * cannot be pulled.
 */
export async function cloudInfo(name: string): Promise<CloudInfo> {
  const { names } = await getCloudModels();
  if (!names.has(name)) return { variants: [], hasLatest: null };
  const tags = await getModelTags(name);
  if (!tags) return { variants: [], hasLatest: null };
  return {
    hasLatest: tags.all.includes("latest"),
    variants: tags.cloud.map((tag) => ({
      ref: `${name}:${tag}`,
      label: tag,
      cloud: true,
      detail: `${name}:${tag} — runs on Ollama Cloud; installs a small pointer, not weights`,
    })),
  };
}

/**
 * Whether this box can actually run cloud models, per the local Ollama server's
 * device-key identity. Deliberately NOT derived from OLLAMA_API_KEY: an API key
 * proves registry access, not inference access.
 */
export async function getCloudAuth(opts?: { force?: boolean }): Promise<CloudAuth> {
  if (!opts?.force && authCache && Date.now() - authCache.at < AUTH_TTL_MS) {
    return authCache.value;
  }
  let value: CloudAuth;
  try {
    const res = await fetch(`${OLLAMA}/api/me`, {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      // 401/403 = a reachable server with no registered device key.
      value = { signedIn: false };
    } else {
      const j = (await res.json()) as { email?: string; name?: string; plan?: string };
      const account = j.email || j.name || undefined;
      value = { signedIn: Boolean(account), account, plan: j.plan };
    }
  } catch {
    value = { signedIn: false, unreachable: true };
  }
  authCache = { value, at: Date.now() };
  return value;
}

/** Drop the cached auth result (after a sign-in/sign-out or an Ollama restart). */
export function invalidateCloudAuth(): void {
  authCache = null;
}
