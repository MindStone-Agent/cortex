import { promises as fs } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { getHardware } from "@/app/lib/hardware";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

type CpuSample = { idle: number; total: number };

async function readCpuStat(): Promise<CpuSample> {
  const text = await fs.readFile("/proc/stat", "utf8");
  const line = text.split("\n")[0];
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = (parts[3] || 0) + (parts[4] || 0);
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

type MemSample = { pct: number; usedBytes: number; totalBytes: number };

async function readMem(): Promise<MemSample> {
  const text = await fs.readFile("/proc/meminfo", "utf8");
  const parse = (key: string) => {
    const m = text.match(new RegExp("^" + key + ":\\s+(\\d+)\\s+kB", "m"));
    return m ? parseInt(m[1], 10) * 1024 : 0;
  };
  const total = parse("MemTotal");
  const available = parse("MemAvailable");
  const used = total - available;
  return { pct: total === 0 ? 0 : (used / total) * 100, usedBytes: used, totalBytes: total };
}

type GpuSample = { util: number; tempC: number; powerW: number };

async function readGpu(): Promise<GpuSample | null> {
  try {
    const { stdout } = await execAsync(
      "nvidia-smi --query-gpu=utilization.gpu,temperature.gpu,power.draw --format=csv,noheader,nounits",
      { timeout: 2000 }
    );
    const [u, t, p] = stdout.trim().split(",").map((s) => s.trim());
    const num = (s: string) => {
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : 0;
    };
    return { util: num(u), tempC: num(t), powerW: num(p) };
  } catch {
    return null;
  }
}

function diffCpuPct(prev: CpuSample, curr: CpuSample): number {
  const dTotal = curr.total - prev.total;
  const dIdle = curr.idle - prev.idle;
  if (dTotal <= 0) return 0;
  return ((dTotal - dIdle) / dTotal) * 100;
}

export async function GET(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let prevCpu = await readCpuStat();
      const hw = await getHardware();
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", close);

      const tick = async () => {
        if (closed) return;
        try {
          const [currCpu, mem, gpu] = await Promise.all([
            readCpuStat(),
            readMem(),
            readGpu(),
          ]);
          const cpuPct = diffCpuPct(prevCpu, currCpu);
          prevCpu = currCpu;
          const payload = {
            t: Date.now(),
            cpuPct,
            memPct: mem.pct,
            memUsedBytes: mem.usedBytes,
            memTotalBytes: mem.totalBytes,
            gpuUtil: gpu?.util ?? null,
            gpuTempC: gpu?.tempC ?? null,
            gpuPowerW: gpu?.powerW ?? null,
            // Hardware-mode hints so the client renders the right primary GPU metric.
            // On unified memory (GB10) util is unreliable — prefer power. See #12.
            mode: hw.mode,
            gpuPowerLimitW: hw.powerLimitW,
          };
          controller.enqueue(encoder.encode("data: " + JSON.stringify(payload) + "\n\n"));
        } catch (e) {
          if (closed) return;
          controller.enqueue(
            encoder.encode("event: error\ndata: " + JSON.stringify({ error: String(e) }) + "\n\n")
          );
        }
      };

      // baseline established above; first tick fires after 1s for real CPU delta
      const interval = setInterval(tick, 1000);

      req.signal.addEventListener("abort", () => clearInterval(interval));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
