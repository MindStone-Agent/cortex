"use client";

import { useEffect, useState } from "react";

type Status = {
  version: string | null;
  apiKeySet: boolean;
  account: string | null;
  contextLength: number | null;
  keepAlive: string | null;
  systemActionsEnabled: boolean;
  applyAvailable: boolean;
};

export function OllamaSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [ctx, setCtx] = useState("");
  const [keep, setKeep] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyStatus = (s: Status) => {
    setStatus(s);
    setCtx(s.contextLength != null ? String(s.contextLength) : "");
    setKeep(s.keepAlive ?? "");
  };

  useEffect(() => {
    let active = true;
    fetch("/api/ollama/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: Status) => {
        if (active) applyStatus(s);
      })
      .catch(() => {
        if (active) setError("Could not load Ollama settings.");
      });
    return () => {
      active = false;
    };
  }, []);

  const enabled = Boolean(status?.systemActionsEnabled && status?.applyAvailable);

  const save = async (overrides: Record<string, unknown>, label: string) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/ollama/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restart: true, ...overrides }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        restarted?: boolean;
        error?: string;
      };
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setApiKey("");
      // Refresh from server (re-resolves the account label, etc.)
      const s = (await fetch("/api/ollama/config", { cache: "no-store" }).then((r) =>
        r.json()
      )) as Status;
      applyStatus(s);
      setMsg(j.error ? j.error : `${label} — Ollama ${j.restarted ? "restarted" : "saved"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveAll = () => {
    const overrides: Record<string, unknown> = {
      contextLength: ctx.trim() ? Number(ctx.trim()) : null,
      keepAlive: keep.trim() ? keep.trim() : null,
    };
    if (apiKey.trim()) overrides.apiKey = apiKey.trim();
    save(overrides, "Settings applied");
  };

  if (!status) {
    return <p className="text-sm text-ink-400">Loading…</p>;
  }

  const fieldCls =
    "w-full rounded border border-ink-800 bg-ink-900/60 px-2 py-1 text-sm text-ink-100 font-mono placeholder:text-ink-600 focus:outline-none focus:border-gold-500/50 disabled:opacity-50";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[11px] font-mono text-ink-500">
        <span>Ollama {status.version ? `v${status.version}` : "(unreachable)"}</span>
      </div>

      {!enabled && (
        <p className="text-[11px] text-ink-500 leading-snug rounded border border-ink-800 bg-ink-900/40 p-2">
          Editing Ollama settings is an opt-in privileged action. Run{" "}
          <span className="font-mono">scripts/enable-ollama-config.sh</span> and set{" "}
          <span className="font-mono">{`system.ollamaConfig: true`}</span> in{" "}
          <span className="font-mono">cortex-config.json</span> to enable Apply. Values below are
          read-only until then.
        </p>
      )}

      {/* Cloud account */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-ink-500 mb-1">
          Ollama Cloud
        </label>
        {status.apiKeySet ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink-200 min-w-0 truncate">
              Signed in
              {status.account ? (
                <>
                  {" · "}
                  <span className="text-nvgreen-500 font-mono">{status.account}</span>
                </>
              ) : (
                <span className="text-ink-500"> · API key set</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => save({ apiKey: null }, "Signed out")}
              disabled={busy || !enabled}
              className="shrink-0 rounded border border-error/40 text-error hover:bg-error/10 px-2 py-1 text-[11px] uppercase tracking-wider font-mono transition disabled:opacity-40"
            >
              {busy ? "…" : "Sign out"}
            </button>
          </div>
        ) : (
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="ollama.com API key (paste to sign in)"
            autoComplete="off"
            spellCheck={false}
            disabled={!enabled}
            className={fieldCls}
          />
        )}
        <p className="text-[11px] text-ink-500 mt-1 leading-snug">
          Authenticates cloud models. Stored in Ollama&apos;s service env; takes effect on restart.
          Native <span className="font-mono">ollama signin</span> still works on the CLI.
        </p>
      </div>

      {/* Default context length */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-ink-500 mb-1">
          Default context length
        </label>
        <input
          type="number"
          value={ctx}
          onChange={(e) => setCtx(e.target.value)}
          placeholder="Ollama default (e.g. 4096)"
          min={256}
          disabled={!enabled}
          className={fieldCls}
        />
      </div>

      {/* Default keep-alive */}
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-ink-500 mb-1">
          Default keep-alive (model timeout)
        </label>
        <input
          type="text"
          value={keep}
          onChange={(e) => setKeep(e.target.value)}
          placeholder="e.g. 5m, 30s, -1 (forever), 0 (evict now)"
          disabled={!enabled}
          className={fieldCls}
        />
        <p className="text-[11px] text-ink-500 mt-1 leading-snug">
          How long a model stays resident after its last use.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={saveAll}
          disabled={busy || !enabled}
          className="rounded border border-ink-700 text-ink-100 hover:bg-ink-800 px-3 py-1.5 text-[11px] uppercase tracking-wider font-mono transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Applying…" : "Apply & restart Ollama"}
        </button>
        {msg && <span className="text-[11px] text-nvgreen-500">{msg}</span>}
        {error && <span className="text-[11px] text-error">{error}</span>}
      </div>
    </div>
  );
}
