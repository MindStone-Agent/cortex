"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkline } from "./Sparkline";

const NVGREEN = "#76B900";
const GOLD = "#F2B23E";
const BUFFER = 60; // 60s rolling window at 1s/sample

type Sample = {
  t: number;
  cpuPct: number;
  memPct: number;
  gpuUtil: number | null;
  gpuTempC: number | null;
  gpuPowerW: number | null;
  mode?: "unified" | "split" | "cpu-only";
  gpuPowerLimitW?: number | null;
};

// Fallback TDP for the power bar when nvidia-smi doesn't report power.limit
// (NVIDIA DGX Spark / GB10 is ~240 W).
const DEFAULT_TDP_W = 240;

function push<T>(arr: T[], v: T, max: number): T[] {
  const next = arr.length >= max ? arr.slice(1) : arr.slice();
  next.push(v);
  return next;
}

export function LivePerf() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/perf");
    esRef.current = es;
    es.onopen = () => {
      setConnected(true);
      setError(null);
    };
    es.onerror = () => {
      setConnected(false);
      setError("Disconnected — reconnecting…");
    };
    es.onmessage = (ev) => {
      try {
        const s = JSON.parse(ev.data) as Sample;
        setSamples((prev) => push(prev, s, BUFFER));
      } catch {
        /* ignore parse errors */
      }
    };
    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  const latest = samples[samples.length - 1];

  return (
    <div className="relative overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40 backdrop-blur-sm p-6 min-h-[200px]">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-nvgreen-500/60 to-nvgreen-500/0" />
      <div className="flex items-start justify-between gap-4 mb-4">
        <h3 className="text-lg font-medium text-ink-100">Live performance</h3>
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-mono text-ink-400">
          <span
            className={
              "inline-block w-1.5 h-1.5 rounded-full " +
              (connected ? "bg-nvgreen-500 animate-pulse" : "bg-ink-600")
            }
          />
          {connected ? "1s" : "off"}
        </span>
      </div>

      {!latest && !error && (
        <p className="text-sm text-ink-400">Connecting…</p>
      )}

      {error && !latest && (
        <p className="text-sm text-error">{error}</p>
      )}

      {latest && (() => {
        const mode = latest.mode ?? "split";
        const unified = mode === "unified";
        const tdp = latest.gpuPowerLimitW ?? DEFAULT_TDP_W;
        return (
        <div className="space-y-5">
          {/* GPU — power-primary on unified memory (GB10), where util is unreliable (#12) */}
          {mode !== "cpu-only" && (
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs uppercase tracking-wider text-ink-400">
                GPU{" "}
                <span className="text-ink-600 normal-case tracking-normal">
                  {unified ? "(power)" : "(util)"}
                </span>
              </span>
              <span className="text-ink-100 font-mono text-sm">
                {unified
                  ? latest.gpuPowerW != null
                    ? latest.gpuPowerW.toFixed(0) + " W"
                    : "—"
                  : latest.gpuUtil != null
                    ? latest.gpuUtil.toFixed(0) + "%"
                    : "—"}
              </span>
            </div>
            <Sparkline
              values={samples.map((s) =>
                unified ? s.gpuPowerW ?? 0 : s.gpuUtil ?? 0
              )}
              min={0}
              max={unified ? tdp : 100}
              height={56}
              color={NVGREEN}
              fillOpacity={0.18}
            />
            <div className="mt-1.5 flex items-center justify-between text-xs text-ink-400 font-mono">
              <span>
                {latest.gpuTempC != null ? latest.gpuTempC.toFixed(0) + "°C" : "—"}
              </span>
              {unified ? (
                <span
                  className="text-ink-600"
                  title="GPU utilization is unreliable on unified-memory hardware (GB10) — it sticks high while a process is merely resident. Power draw is the honest activity signal."
                >
                  util {latest.gpuUtil != null ? latest.gpuUtil.toFixed(0) + "%" : "—"}*
                </span>
              ) : (
                <span>
                  {latest.gpuPowerW != null ? latest.gpuPowerW.toFixed(1) + " W" : "—"}
                </span>
              )}
            </div>
          </div>
          )}

          {/* CPU */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs uppercase tracking-wider text-ink-400">CPU</span>
              <span className="text-ink-100 font-mono text-sm">
                {latest.cpuPct.toFixed(1)}%
              </span>
            </div>
            <Sparkline
              values={samples.map((s) => s.cpuPct)}
              min={0}
              max={100}
              height={48}
              color={GOLD}
              fillOpacity={0.18}
            />
          </div>

          {/* Memory */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs uppercase tracking-wider text-ink-400">
                Memory <span className="text-ink-600 normal-case tracking-normal">(unified)</span>
              </span>
              <span className="text-ink-100 font-mono text-sm">
                {latest.memPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-ink-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gold-500/70 transition-all duration-500"
                style={{ width: latest.memPct + "%" }}
              />
            </div>
          </div>
        </div>
        );
      })()}

      {connected && error && (
        <p className="mt-3 text-xs text-warning font-mono">{error}</p>
      )}
    </div>
  );
}
