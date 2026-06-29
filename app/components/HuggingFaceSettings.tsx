"use client";

import { useEffect, useState } from "react";

// Hugging Face token field for the Settings panel. The token is write-only from
// the UI's perspective: we show whether one is set (and the verified account),
// never the value. Saving verifies the token against HF before storing it.
export function HuggingFaceSettings() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/integrations/huggingface", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { configured?: boolean; user?: string | null }) => {
        if (!active) return;
        setConfigured(Boolean(j.configured));
        setUser(j.user ?? null);
      })
      .catch(() => {
        if (active) setConfigured(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    const t = token.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/huggingface", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; user?: string | null };
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setToken("");
      setConfigured(true);
      setUser(j.user ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/huggingface", { method: "DELETE" });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setConfigured(false);
      setUser(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (configured === null) {
    return <p className="text-sm text-ink-400">Loading…</p>;
  }

  return (
    <div>
      {configured ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-sm text-ink-200">
              Token set
              {user ? (
                <>
                  {" · "}
                  <span className="text-nvgreen-500 font-mono">{user}</span>
                </>
              ) : null}
            </span>
            <span className="block text-[11px] text-ink-500">
              Gated &amp; private GGUF repos are now searchable.
            </span>
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="shrink-0 rounded border border-error/40 text-error hover:bg-error/10 px-2 py-1 text-[11px] uppercase tracking-wider font-mono transition disabled:opacity-40"
          >
            {busy ? "…" : "Clear"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="hf_…"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 min-w-0 rounded border border-ink-800 bg-ink-900/60 px-2 py-1 text-sm text-ink-100 font-mono placeholder:text-ink-600 focus:outline-none focus:border-gold-500/50"
            />
            <button
              type="button"
              onClick={save}
              disabled={busy || !token.trim()}
              className="shrink-0 rounded border border-ink-700 text-ink-200 hover:bg-ink-800 px-2 py-1 text-[11px] uppercase tracking-wider font-mono transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "…" : "Save"}
            </button>
          </div>
          <p className="text-[11px] text-ink-500 leading-snug">
            A read token unlocks gated/private models &amp; higher rate limits. Verified on save,
            stored server-side in <span className="font-mono">cortex-config.json</span> — never sent
            to the browser.
          </p>
        </div>
      )}
      {error && <p className="text-[11px] text-error mt-2">{error}</p>}
    </div>
  );
}
