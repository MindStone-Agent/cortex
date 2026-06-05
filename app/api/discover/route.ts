import { NextResponse } from "next/server";
import { KNOWN_SERVICES, serviceFromCatalog } from "@/app/lib/catalog";
import { getServices } from "@/app/lib/config";

export const dynamic = "force-dynamic";

async function reachable(port: number, healthPath: string): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}${healthPath}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    // Any HTTP response (even 4xx) means something is listening.
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Probe localhost for every known-services port and report the ones that respond
 * but aren't already in cortex-config.json — i.e. tools you're running that Cortex
 * could surface. Consumed by the installer to seed config and (optionally) a UI.
 */
export async function GET() {
  const configuredPorts = new Set(getServices().map((s) => s.port));
  const probed = await Promise.all(
    KNOWN_SERVICES.map(async (entry) => ({
      entry,
      up: await reachable(entry.defaultPort, entry.healthPath),
    }))
  );
  const discovered = probed
    .filter((r) => r.up && !configuredPorts.has(r.entry.defaultPort))
    .map((r) => serviceFromCatalog(r.entry));
  return NextResponse.json({
    discovered,
    probed: KNOWN_SERVICES.length,
    timestamp: new Date().toISOString(),
  });
}
