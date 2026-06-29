"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { ToolsManager } from "./ToolsManager";
import { TailscalePanel } from "./TailscalePanel";
import { HuggingFaceSettings } from "./HuggingFaceSettings";
import { OllamaSettings } from "./OllamaSettings";

type Preset = { id: string; label: string; tagline: string };

const SECTIONS = [
  { id: "theme", label: "Theme" },
  { id: "branding", label: "Branding" },
  { id: "ollama", label: "Ollama" },
  { id: "integrations", label: "Integrations" },
  { id: "tools", label: "Tools & installs" },
  { id: "remote", label: "Remote access" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

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
  const [active, setActive] = useState<SectionId>("theme");

  const [presets, setPresets] = useState<Preset[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [themeBusy, setThemeBusy] = useState(false);

  useEffect(() => setMounted(true), []);

  // Load theme presets + the active one whenever the modal opens.
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

  // Esc closes the modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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

  // Portal to body so the fixed overlay/modal anchor to the viewport, not the
  // backdrop-filtered <header> (which would otherwise be their containing block).
  if (!open || !mounted) return null;

  const activeLabel = SECTIONS.find((s) => s.id === active)?.label ?? "";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className="relative z-[101] flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-ink-800 bg-ink-950 shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-ink-800 px-5 py-4">
          <h2 className="text-lg font-medium text-ink-100">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="px-1 text-2xl leading-none text-ink-400 hover:text-ink-100"
          >
            ×
          </button>
        </div>

        {/* Body: nav rail + active section */}
        <div className="flex min-h-0 flex-1">
          <nav className="w-40 shrink-0 space-y-0.5 overflow-y-auto border-r border-ink-800 p-2 sm:w-48">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActive(s.id)}
                className={
                  "w-full rounded-md px-3 py-2 text-left text-sm transition " +
                  (active === s.id
                    ? "bg-gold-500/10 text-gold-300 ring-1 ring-gold-500/30"
                    : "text-ink-300 hover:bg-ink-900/60 hover:text-ink-100")
                }
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            <h3 className="mb-4 text-xs uppercase tracking-wider text-ink-400">{activeLabel}</h3>

            {active === "theme" && (
              <>
                {presets.length === 0 ? (
                  <p className="text-sm text-ink-400">Loading…</p>
                ) : (
                  <div className="space-y-2">
                    {presets.map((p) => {
                      const isActive = p.id === activeThemeId;
                      return (
                        <label
                          key={p.id}
                          className={
                            "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition " +
                            (isActive
                              ? "border-gold-500/50 bg-gold-500/5"
                              : "border-ink-800 hover:bg-ink-900/60")
                          }
                        >
                          <input
                            type="radio"
                            name="cortex-theme"
                            checked={isActive}
                            disabled={themeBusy}
                            onChange={() => applyTheme(p.id)}
                            className="mt-0.5 h-4 w-4 cursor-pointer accent-gold-500"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm text-ink-200">{p.label}</span>
                            <span className="block truncate text-[11px] text-ink-500">
                              “{p.tagline}”
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="mt-2 text-[11px] leading-snug text-ink-500">
                  Sets the logo, subtitle, and color palette. The name (Cortex) stays the same.
                </p>
              </>
            )}

            {active === "branding" && (
              <>
                <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
                  <span className="text-sm text-ink-200">Show NVIDIA logo</span>
                  <input
                    type="checkbox"
                    checked={showNvidiaLogo}
                    disabled={saving}
                    onChange={(e) => toggleNvidiaLogo(e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-gold-500"
                  />
                </label>
                <p className="mt-1 text-[11px] text-ink-500">
                  Fine-tune the name, logo, and individual colors in{" "}
                  <span className="font-mono">theme.json</span>.
                </p>
              </>
            )}

            {active === "ollama" && <OllamaSettings />}
            {active === "integrations" && <HuggingFaceSettings />}
            {active === "tools" && <ToolsManager />}
            {active === "remote" && <TailscalePanel />}

            {error && <p className="mt-3 text-[11px] text-error">{error}</p>}
            {(saving || themeBusy) && <p className="mt-3 text-[11px] text-ink-400">Saving…</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-ink-800 px-5 py-3">
          <p className="text-[11px] leading-snug text-ink-500">
            Cortex serves on your network without authentication. See{" "}
            <span className="font-mono">SECURITY.md</span> before exposing it beyond a trusted LAN.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
