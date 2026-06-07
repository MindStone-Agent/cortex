/**
 * Built-in theme presets, selectable from Settings → Theme.
 *
 * A theme varies the **logo**, the **subtitle** (header tagline), and the **color
 * palette**. It deliberately does NOT touch the product name ("Cortex") — that is
 * the fixed identity and stays constant across every theme.
 *
 * Palettes override Tailwind @theme tokens by name. The UI's primary accent uses
 * the `gold-*` token ramp and the NVIDIA accent uses `nvgreen-*`; a preset can
 * remap either ramp wholesale to recolor the whole UI.
 *
 * To add a theme: append an entry here. The Settings panel lists them automatically;
 * selecting one writes its logo + tagline + colors into theme.json (name preserved).
 */

export type ThemePreset = {
  id: string;
  label: string;
  /** Header subtitle for this theme. */
  tagline: string;
  /** Logo path under public/ for this theme. */
  logo: string;
  /** Tailwind @theme token overrides (keyed without the `--color-` prefix). */
  colors: Record<string, string>;
};

// MindStone: gold primary + NVIDIA-green secondary (the original Cortex look).
const GOLD_PRIMARY: Record<string, string> = {
  "gold-50": "#FFF8E6",
  "gold-100": "#FCE7A6",
  "gold-300": "#F5CB5C",
  "gold-500": "#F2B23E",
  "gold-600": "#E89A1F",
  "gold-700": "#C7791A",
  "gold-900": "#7A4810",
};

// DGX Spark: NVIDIA-green primary (the gold-* ramp remapped to greens) for an
// on-brand, all-green look that's clearly distinct from the MindStone gold.
const GREEN_PRIMARY: Record<string, string> = {
  "gold-50": "#ECF7D9",
  "gold-100": "#D2EDA6",
  "gold-300": "#A8D850",
  "gold-500": "#76B900",
  "gold-600": "#6AAE00",
  "gold-700": "#5A8C00",
  "gold-900": "#2E4A00",
};

// NVIDIA-green secondary ramp (shared — the "nvidia" accent stays green everywhere).
const NVGREEN: Record<string, string> = {
  "nvgreen-300": "#A8D850",
  "nvgreen-500": "#76B900",
  "nvgreen-700": "#5A8C00",
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "dgx-spark",
    label: "DGX Spark",
    tagline: "DGX Spark command center",
    logo: "/logos/cortex.svg",
    colors: { ...GREEN_PRIMARY, ...NVGREEN },
  },
  {
    id: "mindstone",
    label: "MindStone",
    tagline: "MindStone command center",
    logo: "/logos/mindstone.png",
    colors: { ...GOLD_PRIMARY, ...NVGREEN },
  },
];

/** The default theme for a fresh install (neutral, non-MindStone). */
export const DEFAULT_THEME_ID = "dgx-spark";

export function themePresetById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((t) => t.id === id);
}
