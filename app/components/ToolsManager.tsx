"use client";

import { useEffect, useState } from "react";

type ToolStatus = "running" | "available" | "unsupported";

type Tool = {
  id: string;
  name: string;
  description: string;
  installKind: "docker" | "script";
  note: string | null;
  ui: { port: number; healthPath: string } | null;
  status: ToolStatus;
};

type ToolsResponse = { arch: string; tools: Tool[]; systemActionsEnabled: boolean };

const STATUS_LABEL: Record<ToolStatus, string> = {
  running: "running",
  available: "available",
  unsupported: "unsupported",
};

function StatusBadge({ status }: { status: ToolStatus }) {
  const cls =
    status === "running"
      ? "text-nvgreen-500/90"
      : status === "available"
      ? "text-ink-400"
      : "text-ink-600";
  return (
    <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
      {status === "running" && <span className="h-1.5 w-1.5 rounded-full bg-nvgreen-500" />}
      <span className={cls}>{STATUS_LABEL[status]}</span>
    </span>
  );
}

export function ToolsManager() {
  const [data, setData] = useState<ToolsResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string; error: boolean } | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/tools");
      if (res.ok) setData((await res.json()) as ToolsResponse);
    } catch {
      // non-fatal
    }
  };

  useEffect(() => {
    load();
  }, []);

  const install = async (id: string) => {
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch("/api/tools/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setMsg({ id, text: json.error ?? "Install failed.", error: true });
      } else {
        setMsg({ id, text: "Installed — added to Services.", error: false });
        await load();
      }
    } catch (e) {
      setMsg({ id, text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return <p className="text-sm text-ink-400">Loading…</p>;
  }

  return (
    <div className="space-y-3">
      {!data.systemActionsEnabled && (
        <p className="text-[11px] text-ink-500 leading-snug">
          Installs are read-only here. To enable one-click installs, set{" "}
          <span className="font-mono">system.toolInstall: true</span> in{" "}
          <span className="font-mono">cortex-config.json</span> (the Cortex user must be in the{" "}
          <span className="font-mono">docker</span> group).
        </p>
      )}
      {data.systemActionsEnabled && (
        <p className="text-[11px] text-warning leading-snug">
          ⚠ One-click installs are enabled. Cortex has no authentication, so anyone on this
          network can trigger them — only keep this on for a trusted LAN.
        </p>
      )}
      {data.tools.map((t) => {
        const canInstall =
          data.systemActionsEnabled &&
          t.installKind === "docker" &&
          t.status === "available";
        return (
          <div key={t.id} className="rounded-lg border border-ink-800 bg-ink-900/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-100">{t.name}</span>
              <StatusBadge status={t.status} />
            </div>
            <p className="text-[11px] text-ink-400 mt-1 leading-snug">{t.description}</p>

            <div className="mt-2 flex items-center gap-2">
              {t.status === "running" && t.ui && (
                <span className="text-[11px] text-ink-500 font-mono">:{t.ui.port}</span>
              )}
              {canInstall && (
                <button
                  onClick={() => install(t.id)}
                  disabled={busy === t.id}
                  className="rounded-md bg-gold-500/15 text-gold-300 px-2.5 py-1 text-[11px] hover:bg-gold-500/25 disabled:opacity-50"
                >
                  {busy === t.id ? "Installing…" : "Install"}
                </button>
              )}
              {t.installKind === "script" && t.status !== "running" && t.note && (
                <span className="text-[11px] text-ink-500 leading-snug">{t.note}</span>
              )}
            </div>

            {msg && msg.id === t.id && (
              <p className={"mt-2 text-[11px] " + (msg.error ? "text-error" : "text-nvgreen-500/90")}>
                {msg.text}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
