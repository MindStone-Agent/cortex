import { NextResponse } from "next/server";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getSystemConfig, addServiceToConfig } from "@/app/lib/config";
import { toolById, type Arch } from "@/app/lib/tools";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

function hostArch(): Arch | "other" {
  const a = os.arch();
  if (a === "arm64") return "arm64";
  if (a === "x64") return "amd64";
  return "other";
}

export async function POST(req: Request) {
  const sys = getSystemConfig();
  if (!sys.toolInstall) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Tool installs are disabled. Set "system": { "toolInstall": true } in cortex-config.json ' +
          "(requires the Cortex web user to be in the `docker` group), then restart Cortex.",
      },
      { status: 403 }
    );
  }

  let body: { id?: string };
  try {
    body = (await req.json()) as { id?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const tool = body.id ? toolById(body.id) : undefined;
  if (!tool) {
    return NextResponse.json({ ok: false, error: "Unknown tool id." }, { status: 404 });
  }
  if (!tool.archs.includes(hostArch() as Arch)) {
    return NextResponse.json(
      { ok: false, error: `${tool.name} isn't supported on this architecture (${os.arch()}).` },
      { status: 400 }
    );
  }
  if (tool.install.kind !== "docker") {
    return NextResponse.json(
      { ok: false, error: `${tool.name} is a manual install: ${tool.install.note}` },
      { status: 400 }
    );
  }

  try {
    // No shell, no interpolation: args + image come from the hardcoded catalog.
    const { stdout, stderr } = await execFileAsync(
      "docker",
      ["run", ...tool.install.args, tool.install.image],
      { timeout: 600_000 }
    );

    // If it serves a UI, add it to the services page (reachable at the host the
    // browser is using to reach Cortex).
    if (tool.ui) {
      const host = req.headers.get("host")?.split(":")[0] ?? "localhost";
      addServiceToConfig({
        id: tool.id,
        name: tool.name,
        tagline: "",
        description: tool.description,
        url: `http://${host}:${tool.ui.port}`,
        port: tool.ui.port,
        healthPath: tool.ui.healthPath,
        side: tool.side,
        icon: tool.icon,
      });
    }

    return NextResponse.json({ ok: true, output: `${stdout}\n${stderr}`.trim().slice(-3000) });
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    return NextResponse.json(
      { ok: false, error: (err.stderr || err.message || "docker run failed").slice(-2000) },
      { status: 500 }
    );
  }
}
