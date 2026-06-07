"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

export function SettingsPanel({
  open,
  onClose,
  showNvidiaLogo,
  onShowNvidiaLogoChange,
}: {
  open: boolean;
  onClose: () => void;
  showNvidiaLogo: boolean;
  onShowNvidiaLogoChange: (value: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const toggleNvidiaLogo = async (value: boolean) => {
    onShowNvidiaLogoChange(value); // instant visual
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: { showNvidiaLogo: value } }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        onShowNvidiaLogoChange(!value); // revert on failure
        setError(json.error ?? "Failed to save.");
      }
    } catch (e) {
      onShowNvidiaLogoChange(!value);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // Portal to body so the fixed overlay/panel anchor to the viewport, not the
  // backdrop-filtered <header> (which would otherwise be their containing block).
  if (!open || !mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-black/50" onClick={onClose} aria-hidden />
      <div className="fixed right-0 top-0 z-[101] h-full w-full max-w-sm bg-ink-950 border-l border-ink-800 shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-ink-800">
          <h2 className="text-lg font-medium text-ink-100">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="text-ink-400 hover:text-ink-100 text-2xl leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-8">
          <section>
            <h3 className="text-xs uppercase tracking-wider text-ink-400 mb-3">Branding</h3>
            <label className="flex items-center justify-between gap-4 cursor-pointer py-1">
              <span className="text-sm text-ink-200">Show NVIDIA logo</span>
              <input
                type="checkbox"
                checked={showNvidiaLogo}
                disabled={saving}
                onChange={(e) => toggleNvidiaLogo(e.target.checked)}
                className="h-4 w-4 accent-gold-500 cursor-pointer"
              />
            </label>
            <p className="text-[11px] text-ink-500 mt-1">
              Rename / re-logo and tune colors in <span className="font-mono">theme.json</span> (full
              theming UI coming).
            </p>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-ink-400 mb-3">Tools &amp; installs</h3>
            <p className="text-sm text-ink-400 leading-snug">
              One-click installs for local-AI tools and DGX Spark playbooks will live here —
              install, update, and manage them without touching a terminal.
            </p>
            <a
              href="https://github.com/MindStone-Agent/cortex/issues/13"
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-2 text-xs text-gold-400 hover:underline"
            >
              Track progress → cortex#13
            </a>
          </section>

          {error && <p className="text-[11px] text-error">{error}</p>}
          {saving && <p className="text-[11px] text-ink-400">Saving…</p>}
        </div>
      </div>
    </>,
    document.body
  );
}
