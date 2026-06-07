import fs from "node:fs";
import path from "node:path";

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
   * cascades over the compiled defaults. Omit to keep the default palette.
   */
  colors: Record<string, string>;
};

const DEFAULT_THEME: Theme = {
  brand: {
    name: "Cortex",
    tagline: "MindStone command center",
    logo: "/logos/mindstone.png",
    showNvidiaLogo: true,
  },
  colors: {},
};

/**
 * Load branding/theme at runtime (server-side).
 *   1. theme.json          — your overrides (gitignored, never committed)
 *   2. theme.example.json  — the shipped default
 * Falls back to the built-in Cortex defaults. Read per call so edits apply
 * without a rebuild. To rebrand: `cp theme.example.json theme.json` and edit.
 */
export function loadTheme(): Theme {
  const root = process.cwd();
  for (const file of [path.join(root, "theme.json"), path.join(root, "theme.example.json")]) {
    try {
      if (fs.existsSync(file)) {
        const t = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Theme>;
        return {
          brand: { ...DEFAULT_THEME.brand, ...(t.brand ?? {}) },
          colors: t.colors ?? {},
        };
      }
    } catch {
      // malformed — try the next candidate
    }
  }
  return DEFAULT_THEME;
}

/** Build a `:root { --color-...: ... }` override block from theme.colors (or "" if none). */
export function themeStyle(theme: Theme): string {
  const decls = Object.entries(theme.colors)
    .map(([token, value]) => `--color-${token}: ${value};`)
    .join(" ");
  return decls ? `:root { ${decls} }` : "";
}
