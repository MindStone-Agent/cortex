// Hugging Face integration settings.
//   GET    → { configured, user }      (never returns the token itself)
//   POST   { token }  → verify against HF whoami, store, return { ok, user }
//   DELETE → clear the stored token
//
// The token is persisted server-side in cortex-config.json (owner-only) and
// attached to outbound HF API calls by app/lib/huggingface.ts. It is never sent
// to the browser.

import { NextResponse } from "next/server";
import { getHuggingFace, setHuggingFace } from "@/app/lib/config";

export const dynamic = "force-dynamic";

// Verify a token and resolve the account label. Returns the name on success,
// null if HF rejects the token (or is unreachable).
async function hfWhoami(token: string): Promise<string | null> {
  try {
    const res = await fetch("https://huggingface.co/api/whoami-v2", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { name?: string; fullname?: string };
    return j.name || j.fullname || "authenticated";
  } catch {
    return null;
  }
}

export async function GET() {
  const hf = getHuggingFace();
  return NextResponse.json({ configured: hf !== null, user: hf?.user ?? null });
}

export async function POST(req: Request) {
  let token = "";
  try {
    const b = (await req.json()) as { token?: unknown };
    if (typeof b.token === "string") token = b.token.trim();
  } catch {
    /* validation below */
  }
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing 'token'" }, { status: 400 });
  }

  const user = await hfWhoami(token);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Hugging Face rejected this token (or HF is unreachable). Check it and retry." },
      { status: 400 }
    );
  }

  try {
    setHuggingFace({ token, user });
    return NextResponse.json({ ok: true, configured: true, user });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    setHuggingFace(null);
    return NextResponse.json({ ok: true, configured: false });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
