"use client";

import { useCallback, useEffect, useState } from "react";

type OllamaModel = {
  name: string;
  size: number;
  modifiedAt: string;
  family: string;
  paramSize: string;
  quant: string;
  category: string;
  loaded: boolean;
  contextLength: number | null;
};

type ComfyModel = { name: string; size: number; type: string };

// Format a context window token count: 8192 -> "8K", 131072 -> "128K",
// 10485760 -> "10M".
const fmtCtx = (n: number) => {
  if (n >= 1024 * 1024) {
    const m = n / (1024 * 1024);
    return (Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)) + "M";
  }
  if (n >= 1024) return Math.round(n / 1024) + "K";
  return String(n);
};

type Data = {
  ollama: OllamaModel[] | null;
  comfy: ComfyModel[];
  timestamp: string;
};

const GB = 1024 ** 3;
const fmtGB = (b: number) => {
  if (b < GB) return (b / 1024 ** 2).toFixed(0) + " MB";
  return (b / GB).toFixed(1) + " GB";
};

const CATEGORY_ORDER = ["Reasoning", "Coding", "Vision", "Embedding"];

function groupBy<T>(arr: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

function prettyType(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ActionBtn({
  label,
  onClick,
  busy = false,
  disabled = false,
  danger = false,
  title,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  const tone = danger
    ? "border-error/40 text-error hover:bg-error/10"
    : "border-ink-700 text-ink-300 hover:bg-ink-800 hover:text-ink-100";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={
        "rounded border px-1.5 py-px text-[10px] uppercase tracking-wider font-mono transition " +
        "disabled:opacity-40 disabled:cursor-not-allowed " +
        tone
      }
    >
      {busy ? "…" : label}
    </button>
  );
}

function OllamaRow({ m, onChanged }: { m: OllamaModel; onChanged: () => void }) {
  const [busy, setBusy] = useState<null | "load" | "unload" | "remove">(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const act = async (action: "load" | "unload") => {
    setBusy(action);
    setErr(null);
    try {
      const res = await fetch("/api/models/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, model: m.name }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    setErr(null);
    try {
      const res = await fetch("/api/models/lifecycle", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: m.name }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setConfirmRemove(false);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="group flex items-center justify-between gap-3 py-1.5 border-b border-ink-800/50 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={
            "inline-block w-1.5 h-1.5 rounded-full shrink-0 " +
            (m.loaded ? "bg-nvgreen-500 animate-pulse" : "bg-ink-700")
          }
          title={m.loaded ? "Currently loaded" : "On disk"}
        />
        <span className="text-sm text-ink-100 font-mono truncate">{m.name}</span>
        {m.loaded && (
          <span className="shrink-0 text-[9px] uppercase tracking-wider font-mono text-nvgreen-500 border border-nvgreen-500/40 rounded px-1 py-px">
            loaded
          </span>
        )}
        {err && (
          <span className="shrink-0 text-[10px] font-mono text-error truncate" title={err}>
            {err}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs font-mono text-ink-400 shrink-0">
        {m.paramSize && <span>{m.paramSize}</span>}
        {m.contextLength != null && (
          <span className="text-ink-500" title="Context window (tokens)">
            {fmtCtx(m.contextLength)} ctx
          </span>
        )}
        {m.quant && <span className="text-ink-600">{m.quant}</span>}
        <span className="text-ink-300 w-16 text-right">{fmtGB(m.size)}</span>
        {/* Lifecycle actions — subtle until hover, always reachable */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
          {m.loaded ? (
            <ActionBtn
              label="Unload"
              title="Evict from VRAM"
              onClick={() => act("unload")}
              busy={busy === "unload"}
              disabled={busy !== null}
            />
          ) : (
            <ActionBtn
              label="Load"
              title="Load into VRAM (stays resident until unloaded)"
              onClick={() => act("load")}
              busy={busy === "load"}
              disabled={busy !== null}
            />
          )}
          {confirmRemove ? (
            <>
              <ActionBtn
                label="Confirm"
                danger
                title={`Delete ${m.name} from disk`}
                onClick={remove}
                busy={busy === "remove"}
                disabled={busy !== null}
              />
              <ActionBtn
                label="Cancel"
                onClick={() => setConfirmRemove(false)}
                disabled={busy !== null}
              />
            </>
          ) : (
            <ActionBtn
              label="Remove"
              danger
              title="Delete from disk"
              onClick={() => setConfirmRemove(true)}
              disabled={busy !== null}
            />
          )}
        </div>
      </div>
    </li>
  );
}

function ComfyRow({ m }: { m: ComfyModel }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5 border-b border-ink-800/50 last:border-0">
      <span className="text-sm text-ink-100 font-mono truncate">{m.name}</span>
      <span className="text-xs font-mono text-ink-300 shrink-0 w-16 text-right">
        {fmtGB(m.size)}
      </span>
    </li>
  );
}

export function ModelsList() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = (await res.json()) as Data;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    const interval = setInterval(load, 30_000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [load]);

  if (error && !data) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40 backdrop-blur-sm p-6">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-gold-500/60 to-gold-500/0" />
        <h3 className="text-lg font-medium text-ink-100">Models</h3>
        <p className="mt-2 text-sm text-error">Failed to load: {error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40 backdrop-blur-sm p-6">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-gold-500/60 to-gold-500/0" />
        <h3 className="text-lg font-medium text-ink-100">Models</h3>
        <p className="mt-2 text-sm text-ink-400">Loading…</p>
      </div>
    );
  }

  const ollamaTotal = data.ollama?.reduce((a, m) => a + m.size, 0) ?? 0;
  const ollamaGroups = data.ollama
    ? groupBy(data.ollama, (m) => m.category)
    : new Map<string, OllamaModel[]>();
  const orderedCategories = [
    ...CATEGORY_ORDER.filter((c) => ollamaGroups.has(c)),
    ...[...ollamaGroups.keys()].filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  const comfyTotal = data.comfy.reduce((a, m) => a + m.size, 0);
  const comfyGroups = groupBy(data.comfy, (m) => m.type);
  const orderedComfyTypes = [...comfyGroups.keys()].sort();

  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40 backdrop-blur-sm p-6">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-gold-500/60 to-gold-500/0" />
      <div className="flex items-start justify-between gap-4 mb-5">
        <h3 className="text-lg font-medium text-ink-100">Models</h3>
        <span className="text-[10px] uppercase tracking-wider font-mono text-ink-400">
          refresh 30s
        </span>
      </div>

      {/* Ollama */}
      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h4 className="text-sm font-medium text-ink-100">
            Ollama
            <span className="ml-2 text-xs text-ink-400 font-mono">
              · {data.ollama?.length ?? 0} models · {fmtGB(ollamaTotal)}
            </span>
          </h4>
        </div>
        {data.ollama === null ? (
          <p className="text-sm text-error">Ollama unreachable</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
            {orderedCategories.map((cat) => {
              const models = ollamaGroups.get(cat) ?? [];
              return (
                <div key={cat}>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="text-xs uppercase tracking-wider text-gold-500">
                      {cat}
                    </span>
                    <span className="text-xs font-mono text-ink-600">{models.length}</span>
                  </div>
                  <ul>
                    {models.map((m) => (
                      <OllamaRow key={m.name} m={m} onChanged={load} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ComfyUI */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h4 className="text-sm font-medium text-ink-100">
            ComfyUI
            <span className="ml-2 text-xs text-ink-400 font-mono">
              · {data.comfy.length} models · {fmtGB(comfyTotal)}
            </span>
          </h4>
        </div>
        {data.comfy.length === 0 ? (
          <p className="text-xs text-ink-400 italic">
            No models in ~/ComfyUI/models — install via the Manager tab in ComfyUI.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
            {orderedComfyTypes.map((type) => {
              const models = comfyGroups.get(type) ?? [];
              return (
                <div key={type}>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="text-xs uppercase tracking-wider text-nvgreen-500">
                      {prettyType(type)}
                    </span>
                    <span className="text-xs font-mono text-ink-600">{models.length}</span>
                  </div>
                  <ul>
                    {models.map((m) => (
                      <ComfyRow key={m.name} m={m} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
