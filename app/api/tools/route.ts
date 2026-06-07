import { NextResponse } from "next/server";
import os from "node:os";
import { getSystemConfig } from "@/app/lib/config";
import { TOOLS, type Arch } from "@/app/lib/tools";

export const dynamic = "force-dynamic";

function hostArch(): Arch | "other" {
  const a = os.arch();
  if (a === "arm64") return "arm64";
  if (a === "x64") return "amd64";
  return "other";
}

async function uiResponds(port: number, healthPath: string): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}${healthPath}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    return res.ok || res.status === 401 || res.status === 403; // up even if auth-gated
  } catch {
    return false;
  }
}

type ToolStatus = "running" | "available" | "unsupported";

export async function GET() {
  const arch = hostArch();
  const sys = getSystemConfig();

  const tools = await Promise.all(
    TOOLS.map(async (t) => {
      let status: ToolStatus;
      if (!t.archs.includes(arch as Arch)) {
        status = "unsupported";
      } else if (t.ui && (await uiResponds(t.ui.port, t.ui.healthPath))) {
        status = "running";
      } else {
        status = "available";
      }
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        side: t.side,
        icon: t.icon,
        ui: t.ui ?? null,
        installKind: t.install.kind,
        note: t.install.kind === "script" ? t.install.note : null,
        status,
      };
    })
  );

  return NextResponse.json({ arch, tools, systemActionsEnabled: sys.toolInstall });
}
