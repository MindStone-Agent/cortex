"use client";

import { useEffect, useState } from "react";

type Service = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  port: number;
  side: "mindstone" | "nvidia";
  icon: string;
};

const ICON_PATH: Record<string, string> = {
  chat: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-5 4V5z",
  image: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zm5 5a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm-4 8 5-5 4 4 3-3 4 4v0H4z",
  api: "M3 12h4l3-8 4 16 3-8h4",
  message: "M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7l-5 4V6z",
};

function Icon({ name, className }: { name: string; className?: string }) {
  const d = ICON_PATH[name] ?? ICON_PATH.chat;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

export function ServiceCard({ service }: { service: Service }) {
  const [status, setStatus] = useState<"checking" | "up" | "down">("checking");

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const d = await r.json();
        if (cancelled) return;
        const me = d.services.find((s: { id: string }) => s.id === service.id);
        setStatus(me?.status ?? "down");
      } catch {
        if (!cancelled) setStatus("down");
      }
    }
    check();
    const id = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [service.id]);

  const accent = service.side === "mindstone" ? "gold" : "nvgreen";
  const accentText = service.side === "mindstone" ? "text-gold-500" : "text-nvgreen-500";
  const accentRing = service.side === "mindstone" ? "hover:ring-gold-500/40" : "hover:ring-nvgreen-500/40";
  const accentGlow = service.side === "mindstone" ? "from-gold-500/0 via-gold-500/0 to-gold-500/10" : "from-nvgreen-500/0 via-nvgreen-500/0 to-nvgreen-500/10";

  const statusColor =
    status === "up" ? "bg-success" : status === "down" ? "bg-error" : "bg-ink-600";
  const statusLabel =
    status === "up" ? "Live" : status === "down" ? "Unreachable" : "Checking...";

  return (
    <a
      href={service.url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        "group relative flex flex-col rounded-xl border border-ink-800 bg-ink-900/70 p-6 transition " +
        "hover:bg-ink-800/60 hover:-translate-y-0.5 hover:shadow-2xl ring-1 ring-transparent " +
        accentRing
      }
    >
      <div className={"pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br opacity-0 group-hover:opacity-100 transition " + accentGlow} />
      <div className="relative flex items-start justify-between mb-4">
        <div className={"flex h-10 w-10 items-center justify-center rounded-lg bg-ink-800 " + accentText}>
          <Icon name={service.icon} className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-1.5 text-xs font-mono text-ink-400">
          <span className={"h-2 w-2 rounded-full " + statusColor} />
          {statusLabel}
        </div>
      </div>
      <div className="relative flex-1">
        <h2 className="text-lg font-semibold text-ink-100">
          {service.name}
          <span className={"ml-2 text-xs font-mono " + accentText}>:{service.port}</span>
        </h2>
        <p className="mt-1 text-sm text-ink-300">{service.tagline}</p>
        <p className="mt-3 text-sm text-ink-400 leading-relaxed">{service.description}</p>
      </div>
      <div className="relative mt-5 flex items-center justify-between text-sm">
        <span className="font-mono text-xs text-ink-400">{service.url.replace(/^https?:\/\//, "")}</span>
        <span className={"flex items-center gap-1.5 " + accentText + " font-medium"}>
          Open
          <svg className="h-4 w-4 transition group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </a>
  );
}
