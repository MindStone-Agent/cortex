import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { loadTheme, type Brand } from "@/app/lib/theme";
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

  const current = loadTheme();
  // Start from the current theme; name + logo are the fixed identity and are
  // only ever changed via an explicit body.brand (the UI never sends them).
  const next = {
    themeId: current.themeId ?? DEFAULT_THEME_ID,
    brand: { ...current.brand },
    colors: { ...current.colors },
  };

  // Applying a preset swaps the subtitle + palette; name + logo stay put.
  if (body.themeId !== undefined) {
    const preset = themePresetById(body.themeId);
    if (!preset) {
      return NextResponse.json({ ok: false, error: "Unknown theme." }, { status: 400 });
    }
    next.themeId = preset.id;
    next.brand.tagline = preset.tagline;
    next.colors = { ...preset.colors };
  }

  // Other cosmetic patches (e.g. the NVIDIA-logo toggle, manual color tweaks).
  if (body.brand) next.brand = { ...next.brand, ...body.brand };
  if (body.colors) next.colors = { ...next.colors, ...body.colors };

  try {
    fs.writeFileSync(THEME_FILE, JSON.stringify(next, null, 2) + "\n", "utf8");
    return NextResponse.json({ ok: true, theme: next });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to write theme.json" },
      { status: 500 }
    );
  }
}
