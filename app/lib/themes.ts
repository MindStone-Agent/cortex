/**
 * Built-in theme presets, selectable from Settings → Theme.
 *
 * A theme varies the **subtitle** (header tagline) and the **color palette**.
 * It deliberately does NOT touch the product name ("Cortex") or the logo — those
 * are the fixed brand identity and stay constant across every theme.
 *
 * To add a theme: append an entry here. The Settings panel lists them automatically;
 * selecting one writes its tagline + colors into theme.json (name/logo preserved).
 */

export type ThemePreset = {
  id: string;
  label: string;
  /** Header subtitle for this theme. */
  tagline: string;
  /** Tailwind @theme token overrides (keyed without the `--color-` prefix). */
  colors: Record<string, string>;
};

// Shared base palette. The logo is gold, so both presets keep a gold primary +
// NVIDIA-green secondary; palettes can diverge per-theme later if we want.
const PALETTE: Record<string, string> = {
  "gold-500": "#F2B23E",
  "nvgreen-500": "#76B900",
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "dgx-spark",
    label: "DGX Spark",
    tagline: "DGX Spark command center",
    colors: { ...PALETTE },
  },
  {
    id: "mindstone",
    label: "MindStone",
    tagline: "MindStone command center",
    colors: { ...PALETTE },
  },
];

/** The default theme for a fresh install (neutral, non-MindStone subtitle). */
export const DEFAULT_THEME_ID = "dgx-spark";

export function themePresetById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((t) => t.id === id);
}
