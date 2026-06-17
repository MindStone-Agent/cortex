"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BrowseModel,
  DetailResponse,
  ModelSource,
  ModelVariant,
  PullProgress,
  SearchResponse,
} from "../lib/modelTypes";

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

type PullState = { key: string; ref: string; status: string; pct: number | null; error?: boolean; done?: boolean };

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
  const [pull, setPull] = useState<PullState | null>(null);

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
          setVariants((v) => ({ ...v, [k]: j.variants.length ? j.variants : "error" }));
        } catch {
          setVariants((v) => ({ ...v, [k]: "error" }));
        }
      }
    },
    [expanded, variants],
  );

  const pullRef = useRef<PullState | null>(null);
  pullRef.current = pull;

  const startPull = useCallback(
    async (m: BrowseModel, variant: ModelVariant) => {
      const k = vkey(m.source, m.id);
      setPull({ key: k, ref: variant.ref, status: "starting…", pct: null });
      try {
        const res = await fetch("/api/models/pull", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref: variant.ref }),
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
            if (obj.error) {
              setPull({ key: k, ref: variant.ref, status: obj.error, pct: null, error: true, done: true });
              continue;
            }
            const pct =
              obj.total && obj.total > 0 ? Math.round(((obj.completed ?? 0) / obj.total) * 100) : pullRef.current?.pct ?? null;
            const done = obj.done || obj.status === "success";
            setPull({ key: k, ref: variant.ref, status: done ? "installed ✓" : obj.status ?? "…", pct: done ? 100 : pct, done });
            if (done) {
              if (m.source === "ollama") setInstalled((s) => new Set(s).add(m.id));
              void loadInstalled();
            }
          }
        }
      } catch (e) {
        setPull({ key: k, ref: variant.ref, status: e instanceof Error ? e.message : String(e), pct: null, error: true, done: true });
      }
    },
    [loadInstalled],
  );

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
              const activePull = pull && pull.key === k ? pull : null;
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
                        <div className="flex flex-wrap gap-1.5 py-1">
                          {vlist.map((v) => (
                            <button
                              key={v.ref}
                              onClick={() => startPull(m, v)}
                              disabled={!!activePull && !activePull.done}
                              title={v.detail ?? v.ref}
                              className="text-[11px] font-mono px-2 py-1 rounded-md border border-ink-700 text-ink-200 hover:border-gold-500/50 hover:text-gold-500 disabled:opacity-40 transition-colors"
                            >
                              {v.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pull progress */}
                  {activePull && (
                    <div className="pt-1">
                      <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                        <span className={activePull.error ? "text-error" : "text-ink-400"} title={activePull.ref}>
                          {activePull.ref.length > 36 ? "…" + activePull.ref.slice(-34) : activePull.ref}
                        </span>
                        <span className={activePull.error ? "text-error" : activePull.done ? "text-nvgreen-500" : "text-ink-300"}>
                          {activePull.status}
                          {activePull.pct != null && !activePull.done ? ` ${activePull.pct}%` : ""}
                        </span>
                      </div>
                      {!activePull.error && (
                        <div className="h-1 rounded-full bg-ink-800 overflow-hidden">
                          <div
                            className="h-full bg-gold-500 transition-all"
                            style={{ width: `${activePull.pct ?? (activePull.done ? 100 : 5)}%` }}
                          />
                        </div>
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
