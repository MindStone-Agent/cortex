import { NextResponse } from "next/server";
import os from "node:os";
import { promises as fs } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

async function readMemInfo() {
  const text = await fs.readFile("/proc/meminfo", "utf8");
  const parse = (key: string) => {
    const m = text.match(new RegExp("^" + key + ":\\s+(\\d+)\\s+kB", "m"));
    return m ? parseInt(m[1], 10) * 1024 : 0;
  };
  const total = parse("MemTotal");
  const available = parse("MemAvailable");
  return { total, available, used: total - available };
}

type GpuInfo = {
  name: string;
  utilPercent: number;
  tempC: number;
  powerW: number;
};

async function readGpu(): Promise<GpuInfo | null> {
  try {
    const { stdout } = await execAsync(
      "nvidia-smi --query-gpu=name,utilization.gpu,temperature.gpu,power.draw --format=csv,noheader,nounits",
      { timeout: 3000 }
    );
    const [name, util, temp, power] = stdout.trim().split(",").map((s) => s.trim());
    const num = (s: string) => {
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : 0;
    };
    return {
      name,
      utilPercent: num(util),
      tempC: num(temp),
      powerW: num(power),
    };
  } catch {
    return null;
  }
}

type DiskInfo = { total: number; used: number; available: number };

async function readDisk(): Promise<DiskInfo | null> {
  try {
    const { stdout } = await execAsync(
      "df -B1 --output=size,used,avail / | tail -1",
      { timeout: 3000 }
    );
    const parts = stdout.trim().split(/\s+/);
    return {
      total: parseInt(parts[0], 10),
      used: parseInt(parts[1], 10),
      available: parseInt(parts[2], 10),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const [memory, gpu, disk] = await Promise.all([readMemInfo(), readGpu(), readDisk()]);
  return NextResponse.json({
    cpu: {
      cores: os.cpus().length,
      loadAvg: os.loadavg(),
      arch: os.arch(),
    },
    memory,
    gpu,
    disk,
    uptimeSeconds: os.uptime(),
    timestamp: new Date().toISOString(),
  });
}
