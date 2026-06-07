import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { loadTheme, readRawTheme, type Brand, type RawTheme } from "@/app/lib/theme";
import { THEME_PRESETS, DEFAULT_THEME_ID, themePresetById } from "@/app/lib/themes";

export const dynamic = "force-dynamic";

// Settings persist to theme.json (gitignored, owned by the app). This is a
// cosmetic/config write only — no privileged or system actions here.
const THEME_FILE = path.join(process.cwd(), "theme.json");

export async function GET() {
  const theme = loadTheme();
  return NextResponse.json({
    brand: theme.brand,
    colors: theme.colors,
    themeId: theme.themeId ?? DEFAULT_THEME_ID,
    presets: THEME_PRESETS.map((p) => ({ id: p.id, label: p.label, tagline: p.tagline })),
  });
}

export async function POST(req: Request) {
  let body: { brand?: Partial<Brand>; colors?: Record<string, string>; themeId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  // Work on the RAW stored overrides so we never bake preset-derived values into
  // the file (the preset stays the source of truth for subtitle + palette).
  const next: RawTheme = (() => {
    const raw = readRawTheme();
    return {
      themeId: raw.themeId ?? DEFAULT_THEME_ID,
      brand: { ...(raw.brand ?? {}) },
      colors: { ...(raw.colors ?? {}) },
    };
  })();

  // Applying a preset: select it and clear stored subtitle/palette overrides so the
  // preset drives them. Name + logo (identity) are left untouched.
  if (body.themeId !== undefined) {
    const preset = themePresetById(body.themeId);
    if (!preset) {
      return NextResponse.json({ ok: false, error: "Unknown theme." }, { status: 400 });
    }
    next.themeId = preset.id;
    if (next.brand) delete next.brand.tagline;
    next.colors = {};
  }

  // Other cosmetic patches (e.g. the NVIDIA-logo toggle, manual color tweaks).
  if (body.brand) next.brand = { ...next.brand, ...body.brand };
  if (body.colors) next.colors = { ...next.colors, ...body.colors };

  try {
    fs.writeFileSync(THEME_FILE, JSON.stringify(next, null, 2) + "\n", "utf8");
    return NextResponse.json({ ok: true, theme: loadTheme() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to write theme.json" },
      { status: 500 }
    );
  }
}
