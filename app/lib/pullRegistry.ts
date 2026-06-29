// In-memory registry of in-flight Ollama model pulls.
//
// The registry OWNS the Ollama `/api/pull` stream, so a download keeps running even
// after every browser has navigated away. SSE responses (app/api/models/pull) just
// subscribe/unsubscribe — disconnecting a client never cancels the underlying pull.
// The Models page reattaches on mount via the GET snapshot below.
//
// Scope/limits (acceptable for a single Next server process): state lives in module
// memory, so it resets on a Cortex restart and isn't shared across multiple workers.
// Ollama resumes a pull by digest on the next request, so a restart mid-download just
// means re-issuing the pull.

const OLLAMA = "http://localhost:11434";

export type PullEvent = {
  status?: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
  done?: boolean;
};

type Subscriber = (event: PullEvent) => void;

type ActivePull = {
  ref: string;
  latest: PullEvent;
  startedAt: number;
  done: boolean;
  error?: string;
  subscribers: Set<Subscriber>;
};

const pulls = new Map<string, ActivePull>();

export type PullSnapshot = {
  ref: string;
  latest: PullEvent;
  done: boolean;
  error?: string;
  startedAt: number;
};

/** Snapshot of every tracked pull, for reattach-on-mount. */
export function activePulls(): PullSnapshot[] {
  return [...pulls.values()].map((p) => ({
    ref: p.ref,
    latest: p.latest,
    done: p.done,
    error: p.error,
    startedAt: p.startedAt,
  }));
}

export function getPull(ref: string): ActivePull | undefined {
  return pulls.get(ref);
}

function broadcast(p: ActivePull, event: PullEvent) {
  p.latest = { ...p.latest, ...event };
  for (const sub of [...p.subscribers]) {
    try {
      sub(event);
    } catch {
      /* a dead subscriber shouldn't break the others */
    }
  }
}

function finish(p: ActivePull, event: PullEvent) {
  p.done = true;
  if (event.error) p.error = event.error;
  broadcast(p, { ...event, done: true });
  // Keep a terminal record briefly so late reattachers see the result, then drop it
  // so a future re-pull of the same ref starts clean.
  setTimeout(() => {
    if (pulls.get(p.ref) === p) pulls.delete(p.ref);
  }, 60_000);
}

async function runPull(p: ActivePull) {
  try {
    const res = await fetch(`${OLLAMA}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: p.ref, stream: true }),
    });
    if (!res.ok || !res.body) {
      finish(p, { error: `ollama pull failed (HTTP ${res.status})` });
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
        let event: PullEvent;
        try {
          event = JSON.parse(line) as PullEvent;
        } catch {
          continue;
        }
        if (event.error) {
          finish(p, { error: event.error });
          return;
        }
        broadcast(p, event);
      }
    }
    finish(p, { status: "success" });
  } catch (e) {
    finish(p, { error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Start an Ollama pull for `ref`, or return the one already running. The pull loop
 * runs detached from any subscriber. A finished pull still in the terminal window is
 * replaced (so this doubles as "re-pull").
 */
export function startPull(ref: string): ActivePull {
  const existing = pulls.get(ref);
  if (existing && !existing.done) return existing;
  const p: ActivePull = {
    ref,
    latest: { status: "starting" },
    startedAt: Date.now(),
    done: false,
    subscribers: new Set(),
  };
  pulls.set(ref, p);
  void runPull(p);
  return p;
}

/** Subscribe to a pull's events. Returns an unsubscribe fn. No-op if unknown. */
export function subscribe(ref: string, sub: Subscriber): () => void {
  const p = pulls.get(ref);
  if (!p) return () => {};
  p.subscribers.add(sub);
  return () => p.subscribers.delete(sub);
}
