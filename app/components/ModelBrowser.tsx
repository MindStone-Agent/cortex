"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BrowseModel,
  CloudAuth,
  DetailResponse,
  ModelSource,
  ModelVariant,
  PullProgress,
  SearchResponse,
} from "../lib/modelTypes";

/** Ask the header to open Settings → Ollama (the panel owns its own state). */
const openOllamaSettings = () =>
  window.dispatchEvent(new CustomEvent("cortex:open-settings", { detail: { section: "ollama" } }));

function CloudIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.34 8.5 4.5 4.5 0 0 0 6.5 19z" />
    </svg>
  );
}

const fmtNum = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);

function ago(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const vkey = (source: ModelSource, id: string) => `${source}:${id}`;

/** Cloud tags are the bare `cloud` or size-qualified `<size>-cloud`. */
const isCloudRef = (ref: string) => /(^|-)cloud$/i.test(ref.split(":").pop() ?? "");

type PullState = {
  ref: string;
  status: string;
  pct: number | null;
  error?: boolean;
  done?: boolean;
  /** The model-card key this pull was started from (for inline disable state).
   *  Undefined for pulls reattached on mount (we only know the ref then). */
  cardKey?: string;
  /** Cloud pointer: finishes near-instantly, so it gets no progress bar. */
  cloud?: boolean;
};

export function ModelBrowser() {
  const [source, setSource] = useState<ModelSource>("ollama");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [variants, setVariants] = useState<Record<string, ModelVariant[] | "loading" | "error">>({});
  // Box-wide, so it is learned from whichever card first reports cloud variants.
  const [cloudAuth, setCloudAuth] = useState<CloudAuth | null>(null);
  // Keyed by pull ref. Multiple concurrent downloads, and they survive navigation:
  // the server owns each pull, and we reattach to in-flight ones on mount.
  const [pulls, setPulls] = useState<Record<string, PullState>>({});

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setQuery(input), 300);
    return () => clearTimeout(t);
  }, [input]);

  // Installed Ollama models (to flag results). Base name only (strip :tag).
  const loadInstalled = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      if (!res.ok) return;
      const j = (await res.json()) as { ollama?: { name: string }[] | null };
      setInstalled(new Set((j.ollama ?? []).map((m) => m.name.split(":")[0])));
    } catch {
      /* non-fatal */
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/models");
        if (!res.ok) return;
        const j = (await res.json()) as { ollama?: { name: string }[] | null };
        if (!cancelled) setInstalled(new Set((j.ollama ?? []).map((m) => m.name.split(":")[0])));
      } catch {
        /* non-fatal */
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Primary search (resets results) on source/query change.
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const run = async () => {
      setLoading(true);
      setExpanded(null);
      try {
        const res = await fetch(
          `/api/models/search?source=${source}&q=${encodeURIComponent(query)}`,
          { signal: ctrl.signal },
        );
        const j = (await res.json()) as SearchResponse;
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled && !(e instanceof DOMException && e.name === "AbortError")) {
          setData({ source, query, results: [], nextCursor: null, error: String(e) });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [source, query]);

  const loadMore = useCallback(async () => {
    if (!data?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/models/search?source=${source}&q=${encodeURIComponent(query)}&cursor=${encodeURIComponent(data.nextCursor)}`,
      );
      const j = (await res.json()) as SearchResponse;
      setData((prev) =>
        prev ? { ...j, results: [...prev.results, ...j.results] } : j,
      );
    } catch {
      /* keep current */
    } finally {
      setLoadingMore(false);
    }
  }, [data, source, query, loadingMore]);

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch("/api/models/refresh?source=ollama", { method: "POST" });
    } catch {
      /* ignore — re-search reflects state */
    } finally {
      // Re-run the current search against the fresh index.
      setRefreshing(false);
      const res = await fetch(`/api/models/search?source=ollama&q=${encodeURIComponent(query)}`);
      const j = (await res.json()) as SearchResponse;
      setData(j);
    }
  }, [query]);

  const toggleExpand = useCallback(
    async (m: BrowseModel) => {
      const k = vkey(m.source, m.id);
      if (expanded === k) {
        setExpanded(null);
        return;
      }
      setExpanded(k);
      if (!variants[k]) {
        setVariants((v) => ({ ...v, [k]: "loading" }));
        try {
          const res = await fetch(`/api/models/detail?source=${m.source}&id=${encodeURIComponent(m.id)}`);
          const j = (await res.json()) as DetailResponse;
          if (j.cloudAuth) setCloudAuth(j.cloudAuth);
          setVariants((v) => ({ ...v, [k]: j.variants.length ? j.variants : "error" }));
        } catch {
          setVariants((v) => ({ ...v, [k]: "error" }));
        }
      }
    },
    [expanded, variants],
  );

  const dismissPull = useCallback((ref: string) => {
    setPulls((prev) => {
      if (!(ref in prev)) return prev;
      const next = { ...prev };
      delete next[ref];
      return next;
    });
  }, []);

  // Refs we already have a live SSE reader for — guards against double-attaching
  // (e.g. reattach-on-mount racing a user click).
  const attached = useRef<Set<string>>(new Set());

  const attachPull = useCallback(
    async (ref: string, cardKey?: string, cloud?: boolean) => {
      if (attached.current.has(ref)) return;
      attached.current.add(ref);
      setPulls((prev) => ({
        ...prev,
        [ref]: { ref, status: "starting…", pct: prev[ref]?.pct ?? null, cardKey, cloud },
      }));
      try {
        const res = await fetch("/api/models/pull", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref }),
        });
        if (!res.body) throw new Error("no stream");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const frame = buf.slice(0, i).replace(/^data: /, "");
            buf = buf.slice(i + 2);
            if (!frame) continue;
            let obj: PullProgress;
            try {
              obj = JSON.parse(frame) as PullProgress;
            } catch {
              continue;
            }
            const isDone = obj.done || obj.status === "success";
            setPulls((prev) => {
              const cur = prev[ref] ?? { ref, status: "", pct: null, cardKey, cloud };
              if (obj.error) {
                return { ...prev, [ref]: { ...cur, status: obj.error, pct: null, error: true, done: true } };
              }
              const pct =
                obj.total && obj.total > 0
                  ? Math.round(((obj.completed ?? 0) / obj.total) * 100)
                  : cur.pct ?? null;
              return {
                ...prev,
                [ref]: {
                  ...cur,
                  status: isDone ? (cur.cloud ? "enabled ✓" : "installed ✓") : obj.status ?? "…",
                  pct: isDone ? 100 : pct,
                  done: isDone,
                },
              };
            });
            if (isDone && !obj.error) void loadInstalled();
          }
        }
      } catch (e) {
        setPulls((prev) => ({
          ...prev,
          [ref]: {
            ...(prev[ref] ?? { ref, pct: null }),
            ref,
            status: e instanceof Error ? e.message : String(e),
            pct: null,
            error: true,
            done: true,
          },
        }));
      } finally {
        attached.current.delete(ref);
      }
    },
    [loadInstalled],
  );

  const startPull = useCallback(
    (m: BrowseModel, variant: ModelVariant) => {
      void attachPull(variant.ref, vkey(m.source, m.id), variant.cloud);
    },
    [attachPull],
  );

  // Reattach to any download still in flight (started before this mount/navigation).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/models/pull");
        if (!res.ok) return;
        const j = (await res.json()) as { pulls?: { ref: string; done?: boolean }[] };
        if (cancelled) return;
        for (const p of j.pulls ?? []) {
          // Reattached pulls carry no variant metadata — recover cloud-ness from the ref.
          if (!p.done) void attachPull(p.ref, undefined, isCloudRef(p.ref));
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachPull]);

  const results = data?.results ?? [];

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="inline-flex rounded-lg border border-ink-800 bg-ink-900/40 p-0.5">
          {(["ollama", "hf"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={
                "px-3 py-1.5 text-sm rounded-md transition-colors " +
                (source === s
                  ? "text-gold-500 bg-gold-500/10 ring-1 ring-gold-500/30"
                  : "text-ink-300 hover:text-ink-100")
              }
            >
              {s === "ollama" ? "Ollama library" : "Hugging Face"}
            </button>
          ))}
        </div>

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={source === "ollama" ? "Search the Ollama library…" : "Search Hugging Face GGUF models…"}
          className="flex-1 min-w-[12rem] rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-1.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/30"
        />

        {source === "ollama" && (
          <div className="flex items-center gap-2 text-xs font-mono text-ink-400">
            {data?.indexSource === "fallback" && (
              <span className="text-amber-400" title="Live scrape unavailable — showing a bundled catalog">
                bundled
              </span>
            )}
            {data?.syncedAt && <span>synced {ago(data.syncedAt)}</span>}
            <button
              onClick={doRefresh}
              disabled={refreshing}
              title="Force-rebuild the Ollama index now (bypass the daily cache)"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-ink-800 text-ink-300 hover:text-ink-100 hover:border-ink-700 disabled:opacity-50 transition-colors"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={refreshing ? "animate-spin" : ""}
              >
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v6h-6" />
              </svg>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        )}
      </div>

      {/* Active downloads — server-tracked, so they persist across navigation and
          reattach when you return to this page. */}
      {Object.keys(pulls).length > 0 && (
        <div className="mb-5 rounded-xl border border-ink-800 bg-ink-900/40 p-3 space-y-2.5">
          <div className="text-[10px] uppercase tracking-wider font-mono text-ink-400">
            Active downloads
          </div>
          {Object.values(pulls).map((p) => (
            <div key={p.ref}>
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono mb-1">
                <span className={"truncate " + (p.error ? "text-error" : "text-ink-300")} title={p.ref}>
                  {p.ref.length > 44 ? "…" + p.ref.slice(-42) : p.ref}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span
                    className={p.error ? "text-error" : p.done ? "text-nvgreen-500" : "text-ink-300"}
                  >
                    {p.status}
                    {p.pct != null && !p.done ? ` ${p.pct}%` : ""}
                  </span>
                  {(p.done || p.error) && (
                    <button
                      onClick={() => dismissPull(p.ref)}
                      title="Dismiss"
                      className="text-ink-500 hover:text-ink-200 leading-none text-sm"
                    >
                      ×
                    </button>
                  )}
                </span>
              </div>
              {!p.error && !p.cloud && (
                <div className="h-1 rounded-full bg-ink-800 overflow-hidden">
                  <div
                    className="h-full bg-gold-500 transition-all"
                    style={{ width: `${p.pct ?? (p.done ? 100 : 5)}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <p className="text-sm text-ink-400">Searching…</p>
      ) : data?.error ? (
        <p className="text-sm text-error">Failed: {data.error}</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-ink-400">No models found{query ? ` for “${query}”` : ""}.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {results.map((m) => {
              const k = vkey(m.source, m.id);
              const isInstalled = m.source === "ollama" && installed.has(m.id);
              const vlist = variants[k];
              const isExpanded = expanded === k;
              return (
                <div
                  key={k}
                  className="relative overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40 p-4 flex flex-col gap-2 hover:border-ink-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-mono text-ink-100 hover:text-gold-500 truncate block"
                        title={m.id}
                      >
                        {m.name}
                      </a>
                    </div>
                    {isInstalled && (
                      <span className="shrink-0 text-[9px] uppercase tracking-wider font-mono text-nvgreen-500 border border-nvgreen-500/40 rounded px-1 py-px">
                        installed
                      </span>
                    )}
                  </div>

                  {m.description && (
                    <p className="text-xs text-ink-400 line-clamp-2">{m.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                    {m.capabilities.map((c) => (
                      <span
                        key={c}
                        className="uppercase tracking-wider text-gold-500 border border-gold-500/30 rounded px-1 py-px"
                      >
                        {c}
                      </span>
                    ))}
                    {m.cloud && (
                      <span
                        title="Has an Ollama Cloud variant — runs remotely, no local weights"
                        className="inline-flex items-center gap-0.5 uppercase tracking-wider text-sky-400 border border-sky-400/30 rounded px-1 py-px"
                      >
                        <CloudIcon />
                        cloud
                      </span>
                    )}
                    {m.sizes.slice(0, 6).map((s) => (
                      <span key={s} className="text-ink-500 border border-ink-800 rounded px-1 py-px">
                        {s}
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-3 text-[11px] font-mono text-ink-500 min-w-0">
                      {m.source === "ollama" ? (
                        <>
                          {m.pulls && <span>{m.pulls} pulls</span>}
                          {m.updated && <span className="truncate">{m.updated}</span>}
                        </>
                      ) : (
                        <>
                          {typeof m.downloads === "number" && <span>↓ {fmtNum(m.downloads)}</span>}
                          {typeof m.likes === "number" && m.likes > 0 && <span>♥ {fmtNum(m.likes)}</span>}
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => toggleExpand(m)}
                      className="shrink-0 text-xs px-2.5 py-1 rounded-md border border-gold-500/40 text-gold-500 hover:bg-gold-500/10 transition-colors"
                    >
                      Pull {isExpanded ? "▴" : "▾"}
                    </button>
                  </div>

                  {/* Variant picker */}
                  {isExpanded && (
                    <div className="pt-1 border-t border-ink-800/60">
                      {vlist === "loading" || vlist === undefined ? (
                        <p className="text-xs text-ink-500 py-1">Loading variants…</p>
                      ) : vlist === "error" ? (
                        <p className="text-xs text-error py-1">No pullable variants found.</p>
                      ) : (
                        (() => {
                          // Cloud variants need a registered device key to actually run,
                          // so gate them here rather than letting the pull succeed and
                          // every inference fail afterwards.
                          const hasCloud = vlist.some((v) => v.cloud);
                          const cloudBlocked = hasCloud && cloudAuth !== null && !cloudAuth.signedIn;
                          return (
                            <>
                              <div className="flex flex-wrap gap-1.5 py-1">
                                {vlist.map((v) => {
                                  const busy = !!pulls[v.ref] && !pulls[v.ref]?.done;
                                  const blocked = !!v.cloud && cloudBlocked;
                                  return (
                                    <button
                                      key={v.ref}
                                      onClick={() => startPull(m, v)}
                                      disabled={busy || blocked}
                                      title={
                                        blocked
                                          ? "Sign in to Ollama Cloud to use cloud models"
                                          : v.detail ?? v.ref
                                      }
                                      className={
                                        "inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded-md border disabled:opacity-40 transition-colors " +
                                        (v.cloud
                                          ? "border-sky-400/40 text-sky-300 hover:border-sky-400 hover:text-sky-200 disabled:hover:border-sky-400/40"
                                          : "border-ink-700 text-ink-200 hover:border-gold-500/50 hover:text-gold-500")
                                      }
                                    >
                                      {v.cloud && <CloudIcon />}
                                      {v.label}
                                    </button>
                                  );
                                })}
                              </div>
                              {cloudBlocked && (
                                <p className="text-[11px] text-amber-400 leading-snug pb-1">
                                  {cloudAuth?.unreachable
                                    ? "Ollama is unreachable — cloud variants are unavailable."
                                    : "Cloud models need an Ollama Cloud sign-in on this box. "}
                                  {!cloudAuth?.unreachable && (
                                    <button
                                      onClick={openOllamaSettings}
                                      className="underline underline-offset-2 hover:text-amber-300"
                                    >
                                      Open Ollama settings →
                                    </button>
                                  )}
                                </p>
                              )}
                            </>
                          );
                        })()
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {data?.nextCursor && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-4 py-2 text-sm rounded-lg border border-ink-800 text-ink-200 hover:border-ink-700 hover:text-ink-100 disabled:opacity-50 transition-colors"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
