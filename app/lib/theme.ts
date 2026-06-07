import fs from "node:fs";
import path from "node:path";
import { themePresetById, DEFAULT_THEME_ID } from "./themes";

export type Brand = {
  name: string;
  tagline: string;
  logo: string;
  /** Show the NVIDIA wordmark in the header. Default true. */
  showNvidiaLogo: boolean;
};

export type Theme = {
  brand: Brand;
  /**
   * Overrides for Tailwind `@theme` color tokens, keyed WITHOUT the `--color-`
   * prefix (e.g. "gold-500", "nvgreen-500"). Emitted as a `:root` block that
   * cascades over the compiled defaults.
   */
  colors: Record<string, string>;
  /** Active theme-preset id (see lib/themes.ts). Drives the in-UI selector. */
  themeId?: string;
};

export type RawTheme = {
  brand?: Partial<Brand>;
  colors?: Record<string, string>;
  themeId?: string;
};

/**
 * Brand identity defaults. The name does NOT change with the theme; the logo,
 * subtitle (tagline), and palette do. tagline + logo here are fallbacks — the
 * active theme preset supplies the real ones.
 */
const DEFAULT_BRAND: Brand = {
  name: "Cortex",
  tagline: "DGX Spark command center",
  logo: "/logos/cortex.svg",
  showNvidiaLogo: true,
};

const THEME_JSON = path.join(process.cwd(), "theme.json");
const THEME_EXAMPLE = path.join(process.cwd(), "theme.example.json");

/**
 * Read the stored theme overrides verbatim — theme.json (your settings, gitignored)
 * then theme.example.json (the shipped default) — WITHOUT resolving the preset. Used
 * by the settings writer so a save doesn't bake preset-derived values into the file.
 */
export function readRawTheme(): RawTheme {
  for (const file of [THEME_JSON, THEME_EXAMPLE]) {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as RawTheme;
    } catch {
      // malformed — try the next candidate
    }
  }
  return {};
}

/**
 * Resolve the active theme: the selected preset supplies the logo + subtitle +
 * palette, then any explicit overrides in theme.json win on top. The name comes
 * from the fixed identity (overridable only via an explicit brand entry). Read per
 * call so edits apply without a rebuild.
 */
export function loadTheme(): Theme {
  const raw = readRawTheme();
  const themeId = raw.themeId ?? DEFAULT_THEME_ID;
  const preset = themePresetById(themeId);
  return {
    themeId,
    brand: {
      ...DEFAULT_BRAND,
      ...(preset ? { tagline: preset.tagline, logo: preset.logo } : {}),
      ...(raw.brand ?? {}),
    },
    colors: { ...(preset?.colors ?? {}), ...(raw.colors ?? {}) },
  };
}

/** Build a `:root { --color-...: ... }` override block from theme.colors (or "" if none). */
export function themeStyle(theme: Theme): string {
  const decls = Object.entries(theme.colors)
    .map(([token, value]) => `--color-${token}: ${value};`)
    .join(" ");
  return decls ? `:root { ${decls} }` : "";
}
