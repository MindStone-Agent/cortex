// Model lifecycle actions on the local Ollama daemon.
//   POST   /api/models/lifecycle  { action: "load" | "unload", model }
//   DELETE /api/models/lifecycle  { model }
//
// load/unload ride Ollama's /api/generate with no prompt: keep_alive: -1 pins a
// model resident, keep_alive: 0 evicts it from VRAM. remove proxies /api/delete
// (deletes the weights from disk). No user input ever reaches a shell — this only
// speaks the Ollama HTTP API.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const OLLAMA = "http://localhost:11434";

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asModel(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// load → keep_alive -1 (resident until explicitly unloaded); unload → keep_alive 0.
export async function POST(req: Request) {
  const body = await readBody(req);
  const action = typeof body.action === "string" ? body.action.trim() : "";
  const model = asModel(body.model);

  if (!model) {
    return NextResponse.json({ ok: false, error: "missing 'model'" }, { status: 400 });
  }
  if (action !== "load" && action !== "unload") {
    return NextResponse.json(
      { ok: false, error: "action must be 'load' or 'unload'" },
      { status: 400 }
    );
  }

  const genBody = JSON.stringify({
    model,
    keep_alive: action === "load" ? -1 : 0, // load pins (-1); unload evicts (0)
    stream: false,
  });

  // A cold load can take 1–2 minutes for a large model. Don't hold the HTTP request
  // open for it — that long request resets/times out (esp. under memory pressure) and
  // surfaces as "fetch failed" even when the load succeeds. Instead fire the load and
  // return immediately; the dashboard reflects resident state from /api/ps. Unload is
  // fast (just evicts), so we still await it for a clean confirmation.
  if (action === "load") {
    void fetch(`${OLLAMA}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: genBody,
    }).catch(() => {
      /* fire-and-forget — loaded state shows up via /api/ps once it's resident */
    });
    return NextResponse.json({ ok: true, action, model, started: true });
  }

  try {
    const res = await fetch(`${OLLAMA}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: genBody,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(-500).trim();
      return NextResponse.json(
        { ok: false, error: `ollama ${action} failed (HTTP ${res.status})${detail ? ` — ${detail}` : ""}` },
        { status: 502 }
      );
    }
    await res.json().catch(() => undefined); // drain the single non-stream object
    return NextResponse.json({ ok: true, action, model });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}

// Delete a model from disk/inventory. Destructive — the UI gates this behind a confirm.
export async function DELETE(req: Request) {
  const body = await readBody(req);
  const model = asModel(body.model);

  if (!model) {
    return NextResponse.json({ ok: false, error: "missing 'model'" }, { status: 400 });
  }

  try {
    const res = await fetch(`${OLLAMA}/api/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(-500).trim();
      return NextResponse.json(
        { ok: false, error: `ollama delete failed (HTTP ${res.status})${detail ? ` — ${detail}` : ""}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, model });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
