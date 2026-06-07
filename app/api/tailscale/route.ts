import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getSystemConfig } from "@/app/lib/config";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

// The only command this route invokes. The verb is chosen from a hardcoded set
// below (never free user input), and the wrapper itself re-validates it.
const WRAPPER = "/usr/local/bin/cortex-tailscale.sh";

type TsStatus = {
  enabled: boolean; // system.tailscale opt-in
  installed: boolean; // wrapper + tailscale present and callable
  state: string | null; // BackendState: Running | NeedsLogin | Stopped | ...
  connected: boolean;
  authUrl: string | null; // login URL when authentication is needed
  ips: string[];
  dnsName: string | null;
  hostname: string | null;
  error?: string;
};

const ENABLE_HINT =
  "Run scripts/enable-tailscale-control.sh (sudo), then set \"system\": { \"tailscale\": true } in cortex-config.json and restart Cortex.";

function base(over: Partial<TsStatus>): TsStatus {
  return {
    enabled: false,
    installed: false,
    state: null,
    connected: false,
    authUrl: null,
    ips: [],
    dnsName: null,
    hostname: null,
    ...over,
  };
}

function parseStatus(json: string): Partial<TsStatus> {
  try {
    const s = JSON.parse(json) as {
      BackendState?: string;
      AuthURL?: string;
      TailscaleIPs?: string[];
      Self?: { HostName?: string; DNSName?: string; TailscaleIPs?: string[] };
    };
    return {
      installed: true,
      state: s.BackendState ?? null,
      connected: s.BackendState === "Running",
      authUrl: s.AuthURL || null,
      ips: s.Self?.TailscaleIPs ?? s.TailscaleIPs ?? [],
      dnsName: s.Self?.DNSName?.replace(/\.$/, "") || null,
      hostname: s.Self?.HostName ?? null,
    };
  } catch {
    return { installed: true, error: "Could not parse tailscale status output." };
  }
}

async function runWrapper(verb: "status" | "up" | "down") {
  try {
    const { stdout } = await execFileAsync("sudo", ["-n", WRAPPER, verb], { timeout: 20_000 });
    return { ok: true as const, out: stdout };
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    return { ok: false as const, err: (err.stderr || err.message || "tailscale wrapper failed").trim() };
  }
}

export async function GET() {
  if (!getSystemConfig().tailscale) {
    return NextResponse.json(base({ enabled: false }));
  }
  const r = await runWrapper("status");
  if (!r.ok) {
    return NextResponse.json(base({ enabled: true, installed: false, error: ENABLE_HINT }));
  }
  return NextResponse.json(base({ enabled: true, ...parseStatus(r.out) }));
}

export async function POST(req: Request) {
  if (!getSystemConfig().tailscale) {
    return NextResponse.json(
      { ok: false, error: "Tailscale control is disabled. " + ENABLE_HINT },
      { status: 403 }
    );
  }

  let body: { action?: string };
  try {
    body = (await req.json()) as { action?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  // Hardcoded allowlist — only these reach the wrapper.
  if (body.action !== "up" && body.action !== "down") {
    return NextResponse.json({ ok: false, error: 'action must be "up" or "down".' }, { status: 400 });
  }

  const r = await runWrapper(body.action);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.err || ENABLE_HINT }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: base({ enabled: true, ...parseStatus(r.out) }) });
}
