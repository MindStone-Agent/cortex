"use client";

import { useEffect, useState } from "react";

type Data = {
  cpu: { cores: number; loadAvg: number[]; arch: string };
  disk: { total: number; used: number; available: number } | null;
  host?: { os: string | null; kernel: string; nvidiaDriver: string | null };
  loadedModels?: { name: string; sizeBytes: number }[];
  uptimeSeconds: number;
  timestamp: string;
};

type OllamaUpdate = {
  installed: string | null;
  latest: string | null;
  releaseUrl: string | null;
  updateAvailable: boolean;
  systemActionsEnabled: boolean;
};

const GiB = 1024 ** 3;
const fmtGiB = (b: number) => (b / GiB).toFixed(1);

function fmtUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return d + "d " + h + "h";
  if (h > 0) return h + "h " + m + "m";
  return m + "m";
}

function Shell({ children, uptime }: { children: React.ReactNode; uptime?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40 backdrop-blur-sm p-6 min-h-[200px]">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-gold-500/60 to-gold-500/0" />
      <div className="flex items-start justify-between gap-4 mb-4">
        <h3 className="text-lg font-medium text-ink-100">System stats</h3>
        {uptime && (
          <span className="text-[10px] uppercase tracking-wider font-mono text-ink-400">
            uptime {uptime}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function OllamaRow({ data, refresh }: { data: OllamaUpdate; refresh: () => void }) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "running" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const runUpdate = async () => {
    setPhase("running");
    setMessage(null);
    try {
      const res = await fetch("/api/ollama/update", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; output?: string; error?: string };
      if (!res.ok || !json.ok) {
        setPhase("error");
        setMessage(json.error ?? "Update failed.");
        return;
      }
      setPhase("idle");
      setMessage("Updated and restarted.");
      refresh();
    } catch (e) {
      setPhase("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-ink-400 text-xs uppercase tracking-wider">Ollama</dt>
        <dd className="text-ink-100 font-mono text-xs flex items-center gap-2">
          <span>{data.installed ? "v" + data.installed : "—"}</span>
          {data.updateAvailable && data.latest && (
            <a
              href={data.releaseUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-gold-500/15 text-gold-400 px-2 py-0.5 text-[10px] uppercase tracking-wider hover:bg-gold-500/25"
              title="View release notes"
            >
              update → v{data.latest}
            </a>
          )}
          {!data.updateAvailable && data.installed && data.latest && (
            <span className="text-nvgreen-500/80 text-[10px] uppercase tracking-wider">up to date</span>
          )}
        </dd>
      </div>

      {data.updateAvailable && (
        <div className="mt-1.5">
          {!data.systemActionsEnabled ? (
            <p className="text-ink-400 text-[11px] leading-snug">
              Update available. To install from here, enable system actions
              (<span className="font-mono">scripts/enable-ollama-update.sh</span>); otherwise run{" "}
              <span className="font-mono text-ink-300">curl -fsSL https://ollama.com/install.sh | sh</span>{" "}
              on the host.
            </p>
          ) : phase === "running" ? (
            <p className="text-gold-400 text-[11px]">Updating &amp; restarting Ollama… (can take a minute)</p>
          ) : phase === "confirm" ? (
            <div className="flex items-center gap-2">
              <span className="text-ink-300 text-[11px]">Update Ollama and restart the service?</span>
              <button
                onClick={runUpdate}
                className="rounded-md bg-gold-500/20 text-gold-300 px-2.5 py-1 text-[11px] hover:bg-gold-500/30"
              >
                Confirm
              </button>
              <button
                onClick={() => setPhase("idle")}
                className="rounded-md border border-ink-700 text-ink-400 px-2.5 py-1 text-[11px] hover:text-ink-200"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setPhase("confirm")}
              className="rounded-md bg-gold-500/15 text-gold-300 px-2.5 py-1 text-[11px] hover:bg-gold-500/25"
            >
              Update &amp; restart
            </button>
          )}
        </div>
      )}

      {message && (
        <p className={"mt-1 text-[11px] " + (phase === "error" ? "text-error" : "text-nvgreen-500/80")}>
          {message}
        </p>
      )}
    </div>
  );
}

export function SystemStats() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ollama, setOllama] = useState<OllamaUpdate | null>(null);

  const fetchOllama = async () => {
    try {
      const res = await fetch("/api/ollama/update");
      if (res.ok) setOllama((await res.json()) as OllamaUpdate);
    } catch {
      // non-fatal — the Ollama row just won't render
    }
  };

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/system");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = (await res.json()) as Data;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    fetchData();
    fetchOllama();
    const interval = setInterval(fetchData, 5 * 60_000);
    const ollamaInterval = setInterval(fetchOllama, 30 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(ollamaInterval);
    };
  }, []);

  if (error && !data) {
    return (
      <Shell>
        <p className="text-sm text-error">Failed to load: {error}</p>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <p className="text-sm text-ink-400">Loading…</p>
      </Shell>
    );
  }

  const diskPct = data.disk ? (data.disk.used / data.disk.total) * 100 : 0;

  return (
    <Shell uptime={fmtUptime(data.uptimeSeconds)}>
      <dl className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-x-6">
          <div>
            <dt className="text-ink-400 text-xs uppercase tracking-wider">CPU</dt>
            <dd className="text-ink-100 font-mono mt-1">
              {data.cpu.cores} cores · {data.cpu.arch}
            </dd>
            <dd className="text-ink-400 font-mono text-xs mt-0.5">
              load {data.cpu.loadAvg.map((l) => l.toFixed(2)).join(" · ")}
            </dd>
          </div>
          {data.host && (
            <div className="min-w-0">
              <dt className="text-ink-400 text-xs uppercase tracking-wider">System</dt>
              <dd className="text-ink-100 font-mono mt-1 truncate" title={data.host.os ?? undefined}>
                {data.host.os ?? "—"}
              </dd>
              <dd className="text-ink-400 font-mono text-xs mt-0.5 truncate">
                kernel {data.host.kernel}
                {data.host.nvidiaDriver ? " · driver " + data.host.nvidiaDriver : ""}
              </dd>
            </div>
          )}
        </div>
        {ollama && ollama.installed && <OllamaRow data={ollama} refresh={fetchOllama} />}
        {data.disk && (
          <div>
            <div className="flex items-baseline justify-between">
              <dt className="text-ink-400 text-xs uppercase tracking-wider">Disk (/)</dt>
              <dd className="text-ink-100 font-mono text-xs">
                {fmtGiB(data.disk.used)} / {fmtGiB(data.disk.total)} GiB
              </dd>
            </div>
            <div className="h-1.5 w-full bg-ink-800 rounded-full overflow-hidden mt-1.5">
              <div className="h-full bg-nvgreen-500/70" style={{ width: diskPct + "%" }} />
            </div>
          </div>
        )}
        {data.loadedModels && data.loadedModels.length > 0 && (
          <div>
            <dt className="text-ink-400 text-xs uppercase tracking-wider">Models loaded</dt>
            <ul className="mt-1.5 space-y-1">
              {data.loadedModels.map((m) => (
                <li key={m.name} className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-100 font-mono text-xs truncate">{m.name}</span>
                  <span className="text-ink-400 font-mono text-xs shrink-0">
                    {fmtGiB(m.sizeBytes)} GiB
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </dl>
    </Shell>
  );
}
