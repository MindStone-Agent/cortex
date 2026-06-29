// Model pull, registry-backed so downloads survive the browser navigating away.
//   POST /api/models/pull { ref }  → start-or-attach; streams progress as SSE.
//   GET  /api/models/pull          → snapshot of all in-flight pulls (reattach).
//
// The actual Ollama stream is owned by app/lib/pullRegistry — this route only
// subscribes/unsubscribes, so closing an SSE connection never cancels the download.
// `ref` is a full pull ref: "llama3.1:8b" or "hf.co/owner/repo:Q4_K_M".

import { activePulls, startPull, subscribe, type PullEvent } from "@/app/lib/pullRegistry";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ pulls: activePulls() });
}

export async function POST(req: Request) {
  let ref = "";
  try {
    const body = (await req.json()) as { ref?: unknown };
    if (typeof body.ref === "string") ref = body.ref.trim();
  } catch {
    /* fall through to validation */
  }
  if (!ref) return new Response("missing 'ref'", { status: 400 });

  // Start the pull (or attach to one already running). The registry keeps reading
  // the Ollama stream even if this SSE connection drops.
  const pull = startPull(ref);

  const encoder = new TextEncoder();
  let unsubscribe = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* controller already closed */
        }
      };

      // Replay the latest snapshot so a reattaching client renders progress at once.
      send(pull.latest);
      if (pull.done) {
        send({ ...pull.latest, done: true });
        controller.close();
        return;
      }

      unsubscribe = subscribe(ref, (event: PullEvent) => {
        send(event);
        if (event.done) {
          unsubscribe();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      });
    },
    // Client disconnected — stop writing, but let the registry keep pulling.
    cancel() {
      unsubscribe();
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
