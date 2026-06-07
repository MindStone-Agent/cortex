import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { loadTheme, type Brand } from "@/app/lib/theme";

export const dynamic = "force-dynamic";

// Settings persist to theme.json (gitignored, owned by the app). This is a
// cosmetic/config write only — no privileged or system actions here.
const THEME_FILE = path.join(process.cwd(), "theme.json");

export async function GET() {
  const theme = loadTheme();
  return NextResponse.json({ brand: theme.brand, colors: theme.colors });
}

export async function POST(req: Request) {
  let body: { brand?: Partial<Brand>; colors?: Record<string, string> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const current = loadTheme();
  const next = {
    brand: { ...current.brand, ...(body.brand ?? {}) },
    colors: { ...current.colors, ...(body.colors ?? {}) },
  };

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
