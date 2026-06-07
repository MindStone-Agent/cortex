"use client";

import { useCallback, useEffect, useState } from "react";

type TsStatus = {
  enabled: boolean;
  installed: boolean;
  state: string | null;
  connected: boolean;
  authUrl: string | null;
  ips: string[];
  dnsName: string | null;
  hostname: string | null;
  error?: string;
};

export function TailscalePanel() {
  const [data, setData] = useState<TsStatus | null>(null);
  const [busy, setBusy] = useState<null | "up" | "down">(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/tailscale", { cache: "no-store" });
      if (r.ok) setData((await r.json()) as TsStatus);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // While a login is pending (auth URL shown, not yet connected), poll for status.
  useEffect(() => {
    if (!data?.enabled || data.connected || !data.authUrl) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [data?.enabled, data?.connected, data?.authUrl, load]);

  const act = async (action: "up" | "down") => {
    setBusy(action);
    setMsg(null);
    try {
      const r = await fetch("/api/tailscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string; status?: TsStatus };
      if (!r.ok || !j.ok) setMsg(j.error ?? "Action failed.");
      else if (j.status) setData(j.status);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <p className="text-sm text-ink-400">Loading…</p>;

  if (!data.enabled) {
    return (
      <p className="text-[11px] text-ink-500 leading-snug">
        Off. Run <span className="font-mono">scripts/enable-tailscale-control.sh</span> (sudo), set{" "}
        <span className="font-mono">system.tailscale: true</span> in{" "}
        <span className="font-mono">cortex-config.json</span>, and restart Cortex.
      </p>
    );
  }

  if (!data.installed) {
    return <p className="text-[11px] text-warning leading-snug">{data.error ?? "Tailscale not reachable."}</p>;
  }

  const ip4 = data.ips.find((i) => i.includes("."));
  const stopped = data.state === "Stopped" || data.state === "NoState" || data.state === null;
  const stateLabel = data.connected
    ? "Connected"
    : data.state === "NeedsLogin"
    ? "Needs login"
    : data.state === "Stopped"
    ? "Disconnected"
    : data.state ?? "Unknown";
  const dot = data.connected ? "bg-nvgreen-500" : data.authUrl ? "bg-warning" : "bg-ink-600";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-sm text-ink-200">
          <span className={"h-2 w-2 rounded-full " + dot} />
          {stateLabel}
        </span>
        <div className="flex gap-2">
          {!data.connected && (
            <button
              onClick={() => act("up")}
              disabled={busy !== null}
              className="rounded-md bg-gold-500/15 text-gold-300 px-2.5 py-1 text-[11px] hover:bg-gold-500/25 disabled:opacity-50"
            >
              {busy === "up" ? "Connecting…" : "Connect"}
            </button>
          )}
          {!stopped && (
            <button
              onClick={() => act("down")}
              disabled={busy !== null}
              className="rounded-md bg-ink-800 text-ink-300 px-2.5 py-1 text-[11px] hover:bg-ink-700 disabled:opacity-50"
            >
              {busy === "down" ? "…" : "Disconnect"}
            </button>
          )}
        </div>
      </div>

      {data.authUrl && !data.connected && (
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-2.5">
          <p className="text-[11px] text-ink-300 leading-snug">Authenticate this node to your tailnet:</p>
          <a
            href={data.authUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-gold-300 underline break-all"
          >
            {data.authUrl}
          </a>
          <p className="text-[10px] text-ink-500 mt-1">Waiting for login… (auto-refreshes)</p>
        </div>
      )}

      {data.connected && (ip4 || data.dnsName) && (
        <div className="text-[11px] text-ink-400 font-mono space-y-0.5">
          {ip4 && <div>IP: {ip4}</div>}
          {data.dnsName && <div className="break-all">{data.dnsName}</div>}
        </div>
      )}

      <p className="text-[11px] text-warning leading-snug">
        ⚠ Cortex has no authentication — anyone on this network can toggle the VPN. Keep this on a
        trusted LAN only.
      </p>
      {msg && <p className="text-[11px] text-error">{msg}</p>}
    </div>
  );
}
