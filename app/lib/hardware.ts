import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Hardware memory topology:
 *  - "unified"  — GPU memory is unified with system RAM (NVIDIA GB10 / DGX Spark).
 *                 `nvidia-smi` reports `memory.total` as `[N/A]` and GPU util is an
 *                 unreliable "busy" signal (sticks high while a process is merely
 *                 resident) — prefer power draw. See issue #12.
 *  - "split"    — discrete GPU with its own VRAM pool (typical desktop/server NVIDIA).
 *  - "cpu-only" — no NVIDIA GPU detected.
 */
export type HardwareMode = "unified" | "split" | "cpu-only";

export type HardwareInfo = {
  mode: HardwareMode;
  gpuName: string | null;
  /** Total VRAM in bytes for split-memory GPUs; null for unified / cpu-only. */
  vramTotalBytes: number | null;
  /** Enforced power limit (TDP) in watts when reported — drives the power-as-% bar. */
  powerLimitW: number | null;
};

const CPU_ONLY: HardwareInfo = {
  mode: "cpu-only",
  gpuName: null,
  vramTotalBytes: null,
  powerLimitW: null,
};

let cached: HardwareInfo | null = null;

async function detect(): Promise<HardwareInfo> {
  try {
    const { stdout } = await execAsync(
      "nvidia-smi --query-gpu=name,memory.total,power.limit --format=csv,noheader,nounits",
      { timeout: 3000 }
    );
    const [name, memTotal, powerLimit] = stdout.trim().split(",").map((s) => s.trim());
    if (!name) return CPU_ONLY;
    // Unified-memory parts (GB10) report memory.total as "[N/A]" / "Not Supported".
    const memMiB = parseFloat(memTotal);
    const unified = !Number.isFinite(memMiB);
    const powerW = parseFloat(powerLimit);
    return {
      mode: unified ? "unified" : "split",
      gpuName: name,
      vramTotalBytes: unified ? null : memMiB * 1024 * 1024,
      powerLimitW: Number.isFinite(powerW) ? powerW : null,
    };
  } catch {
    return CPU_ONLY;
  }
}

/**
 * Detect the hardware mode once and cache it — topology does not change while the
 * process is running. Safe to call from any server route.
 */
export async function getHardware(): Promise<HardwareInfo> {
  if (!cached) cached = await detect();
  return cached;
}
