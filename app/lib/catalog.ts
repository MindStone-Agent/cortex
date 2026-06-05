import type { Service } from "./config";

export type CatalogEntry = {
  id: string;
  name: string;
  description: string;
  defaultPort: number;
  healthPath: string;
  icon: string;
  side: "mindstone" | "nvidia";
};

/**
 * Bundled catalog of common local-AI tools with their well-known default ports.
 * Used by auto-discovery (probe localhost for these ports) and as the source for
 * a quick "add a known service" flow. Ports/paths are each project's documented
 * defaults — users override per service in cortex-config.json.
 */
export const KNOWN_SERVICES: CatalogEntry[] = [
  { id: "ollama", name: "Ollama", description: "OpenAI-compatible local inference API.", defaultPort: 11434, healthPath: "/api/version", icon: "api", side: "nvidia" },
  { id: "openwebui", name: "Open WebUI", description: "Web chat UI for local models.", defaultPort: 8080, healthPath: "/health", icon: "chat", side: "mindstone" },
  { id: "comfyui", name: "ComfyUI", description: "Node-based image generation studio.", defaultPort: 8188, healthPath: "/system_stats", icon: "image", side: "mindstone" },
  { id: "vllm", name: "vLLM", description: "High-throughput inference server.", defaultPort: 8000, healthPath: "/health", icon: "api", side: "nvidia" },
  { id: "tgwebui", name: "Text Generation WebUI", description: "Gradio UI for local LLMs (oobabooga).", defaultPort: 7860, healthPath: "/", icon: "chat", side: "mindstone" },
  { id: "automatic1111", name: "Stable Diffusion WebUI", description: "AUTOMATIC1111 image generation UI.", defaultPort: 7861, healthPath: "/", icon: "image", side: "mindstone" },
  { id: "lmstudio", name: "LM Studio", description: "Local model server (OpenAI-compatible).", defaultPort: 1234, healthPath: "/v1/models", icon: "api", side: "mindstone" },
  { id: "llamacpp", name: "llama.cpp server", description: "llama.cpp HTTP server.", defaultPort: 8081, healthPath: "/health", icon: "api", side: "mindstone" },
  { id: "jupyter", name: "Jupyter", description: "Notebooks for experimentation.", defaultPort: 8888, healthPath: "/api", icon: "api", side: "mindstone" },
];

export function catalogById(id: string): CatalogEntry | undefined {
  return KNOWN_SERVICES.find((s) => s.id === id);
}

/** Build a full Service from a catalog entry on the given host. */
export function serviceFromCatalog(entry: CatalogEntry, host = "localhost"): Service {
  return {
    id: entry.id,
    name: entry.name,
    tagline: "",
    description: entry.description,
    url: `http://${host}:${entry.defaultPort}`,
    port: entry.defaultPort,
    healthPath: entry.healthPath,
    side: entry.side,
    icon: entry.icon,
  };
}
