"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { ToolsManager } from "./ToolsManager";

type Preset = { id: string; label: string; tagline: string };

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

  const [presets, setPresets] = useState<Preset[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [themeBusy, setThemeBusy] = useState(false);

  useEffect(() => setMounted(true), []);

  // Load theme presets + the active one whenever the panel opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { presets?: Preset[]; themeId?: string };
        if (cancelled) return;
        setPresets(json.presets ?? []);
        setActiveThemeId(json.themeId ?? null);
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

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

  const applyTheme = async (id: string) => {
    if (id === activeThemeId || themeBusy) return;
    setThemeBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId: id }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to apply theme.");
        setThemeBusy(false);
        return;
      }
      // Subtitle + palette are server-rendered; reload to apply them everywhere.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setThemeBusy(false);
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
            <h3 className="text-xs uppercase tracking-wider text-ink-400 mb-3">Theme</h3>
            {presets.length === 0 ? (
              <p className="text-sm text-ink-400">Loading…</p>
            ) : (
              <div className="space-y-2">
                {presets.map((p) => {
                  const active = p.id === activeThemeId;
                  return (
                    <label
                      key={p.id}
                      className={
                        "flex items-start gap-3 cursor-pointer rounded-lg border p-3 transition " +
                        (active
                          ? "border-gold-500/50 bg-gold-500/5"
                          : "border-ink-800 hover:bg-ink-900/60")
                      }
                    >
                      <input
                        type="radio"
                        name="cortex-theme"
                        checked={active}
                        disabled={themeBusy}
                        onChange={() => applyTheme(p.id)}
                        className="mt-0.5 h-4 w-4 accent-gold-500 cursor-pointer"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm text-ink-200">{p.label}</span>
                        <span className="block text-[11px] text-ink-500 truncate">
                          “{p.tagline}”
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-ink-500 mt-2 leading-snug">
              Sets the subtitle and color palette. The name (Cortex) and logo stay the same.
            </p>
          </section>

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
              Fine-tune the name, logo, and individual colors in{" "}
              <span className="font-mono">theme.json</span>.
            </p>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-ink-400 mb-3">Tools &amp; installs</h3>
            <ToolsManager />
          </section>

          {error && <p className="text-[11px] text-error">{error}</p>}
          {(saving || themeBusy) && <p className="text-[11px] text-ink-400">Saving…</p>}
        </div>
      </div>
    </>,
    document.body
  );
}
