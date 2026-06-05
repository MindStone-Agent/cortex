import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";

type OllamaTag = {
  name: string;
  size: number;
  modified_at: string;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
};

type OllamaPsItem = { name: string };

type OllamaModel = {
  name: string;
  size: number;
  modifiedAt: string;
  family: string;
  paramSize: string;
  quant: string;
  category: string;
  loaded: boolean;
  contextLength: number | null;
};

type ComfyModel = { name: string; size: number; type: string };

const MODEL_EXTS = /\.(safetensors|ckpt|pt|pth|bin|onnx|gguf)$/i;

function categorize(name: string, family: string): string {
  const n = name.toLowerCase();
  const f = (family || "").toLowerCase();
  if (n.includes("embed")) return "Embedding";
  if (n.includes("coder") || n.includes("devstral")) return "Coding";
  if (n.includes("vision") || n.includes("vl") || f.includes("vl")) return "Vision";
  return "Reasoning";
}

// Context window lives in /api/show's model_info under "<arch>.context_length".
async function fetchContextLength(name: string): Promise<number | null> {
  try {
    const res = await fetch("http://localhost:11434/api/show", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name }),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { model_info?: Record<string, unknown> };
    for (const [k, v] of Object.entries(json.model_info || {})) {
      if (k.endsWith(".context_length") && typeof v === "number") return v;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchOllama(): Promise<OllamaModel[] | null> {
  try {
    const [tagsRes, psRes] = await Promise.all([
      fetch("http://localhost:11434/api/tags", { cache: "no-store" }),
      fetch("http://localhost:11434/api/ps", { cache: "no-store" }),
    ]);
    if (!tagsRes.ok) return null;
    const tagsJson = (await tagsRes.json()) as { models?: OllamaTag[] };
    const psJson = (await psRes.json()) as { models?: OllamaPsItem[] };
    const loaded = new Set((psJson.models || []).map((m) => m.name));
    const tags = tagsJson.models || [];
    const contexts = await Promise.all(tags.map((m) => fetchContextLength(m.name)));
    return tags.map((m, i) => {
      const family = m.details?.family || "";
      return {
        name: m.name,
        size: m.size,
        modifiedAt: m.modified_at,
        family,
        paramSize: m.details?.parameter_size || "",
        quant: m.details?.quantization_level || "",
        category: categorize(m.name, family),
        loaded: loaded.has(m.name),
        contextLength: contexts[i],
      };
    });
  } catch {
    return null;
  }
}

async function scanComfy(): Promise<ComfyModel[]> {
  const base = path.join(os.homedir(), "ComfyUI", "models");
  const out: ComfyModel[] = [];
  let subdirs;
  try {
    subdirs = await fs.readdir(base, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const sub of subdirs) {
    if (!sub.isDirectory()) continue;
    const subPath = path.join(base, sub.name);
    let files;
    try {
      files = await fs.readdir(subPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.isFile()) continue;
      if (f.name.startsWith("put_") && f.name.endsWith("_here")) continue;
      if (f.name.startsWith(".")) continue;
      if (!MODEL_EXTS.test(f.name)) continue;
      try {
        const st = await fs.stat(path.join(subPath, f.name));
        out.push({ name: f.name, size: st.size, type: sub.name });
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

export async function GET() {
  const [ollama, comfy] = await Promise.all([fetchOllama(), scanComfy()]);
  return NextResponse.json({
    ollama,
    comfy,
    timestamp: new Date().toISOString(),
  });
}
