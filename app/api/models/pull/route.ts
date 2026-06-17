// POST /api/models/pull  { ref: string }
// Proxies the local Ollama daemon's streaming /api/pull (NDJSON) out to the
// browser as Server-Sent Events so the UI can render a live progress bar.
// `ref` is a full pull ref: "llama3.1:8b" or "hf.co/owner/repo:Q4_K_M".

export const dynamic = "force-dynamic";

const OLLAMA = "http://localhost:11434";

export async function POST(req: Request) {
  let ref = "";
  try {
    const body = (await req.json()) as { ref?: unknown };
    if (typeof body.ref === "string") ref = body.ref.trim();
  } catch {
    /* fall through to validation */
  }
  if (!ref) return new Response("missing 'ref'", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        const res = await fetch(`${OLLAMA}/api/pull`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: ref, stream: true }),
        });
        if (!res.ok || !res.body) {
          send({ error: `ollama pull failed (HTTP ${res.status})`, done: true });
          controller.close();
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            try {
              send(JSON.parse(line));
            } catch {
              /* skip partial/non-JSON line */
            }
          }
        }
        send({ status: "success", done: true });
        controller.close();
      } catch (e) {
        send({ error: e instanceof Error ? e.message : String(e), done: true });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
