/**
 * Catalog of installable tools for the Settings → Tools panel.
 *
 * Install commands are fully defined here (no user input ever reaches the shell —
 * the install route runs `docker run` via execFile with these exact args), so the
 * only thing the UI controls is *which* catalog id to install. Docker installs need
 * no sudo (the Cortex web user must be in the `docker` group); the install action is
 * gated only by the `system.toolInstall` opt-in flag.
 */

export type Arch = "amd64" | "arm64";

export type ToolInstall =
  | { kind: "docker"; image: string; args: string[] }
  | { kind: "script"; note: string };

export type Tool = {
  id: string;
  name: string;
  description: string;
  archs: Arch[];
  /** If it serves a UI: the port + health path. Used for status probing and to add
   *  a service card on successful install. */
  ui?: { port: number; healthPath: string };
  side: "primary" | "nvidia";
  icon: string;
  install: ToolInstall;
};

export const TOOLS: Tool[] = [
  {
    id: "open-webui",
    name: "Open WebUI",
    description: "Web chat UI for your local Ollama models.",
    archs: ["amd64", "arm64"],
    ui: { port: 8080, healthPath: "/health" },
    side: "primary",
    icon: "chat",
    install: {
      kind: "docker",
      image: "ghcr.io/open-webui/open-webui:main",
      args: [
        "-d",
        "--name", "open-webui",
        "--restart", "unless-stopped",
        "-p", "8080:8080",
        "--add-host", "host.docker.internal:host-gateway",
        "-e", "OLLAMA_BASE_URL=http://host.docker.internal:11434",
        "-v", "open-webui:/app/backend/data",
      ],
    },
  },
  {
    id: "jupyter",
    name: "Jupyter Lab",
    description: "Notebooks for experimentation, with GPU access.",
    archs: ["amd64", "arm64"],
    ui: { port: 8888, healthPath: "/api" },
    side: "nvidia",
    icon: "api",
    install: {
      kind: "docker",
      image: "quay.io/jupyter/scipy-notebook:latest",
      args: [
        "-d",
        "--name", "jupyter",
        "--restart", "unless-stopped",
        "--gpus", "all",
        "-p", "8888:8888",
        "-v", "jupyter-data:/home/jovyan/work",
      ],
    },
  },
  {
    id: "vllm",
    name: "vLLM",
    description:
      "High-throughput, OpenAI-compatible LLM serving engine (serves one model per container). Not NVIDIA's own — that's NIM; vLLM is the leading open-source server and runs great on NVIDIA GPUs.",
    archs: ["amd64", "arm64"],
    ui: { port: 8000, healthPath: "/health" },
    side: "nvidia",
    icon: "api",
    install: {
      kind: "script",
      note:
        "Serves one model at a time over an OpenAI-compatible API. The image is multi-arch " +
        "(amd64 + arm64). Pick your model and run, e.g.: `docker run -d --name vllm --gpus all " +
        "-p 8000:8000 -v ~/.cache/huggingface:/root/.cache/huggingface " +
        "-e HUGGING_FACE_HUB_TOKEN=<token> vllm/vllm-openai:latest --model <hf-repo>`. " +
        "It appears here once it's serving on :8000.",
    },
  },
  {
    id: "unsloth-studio",
    name: "Unsloth Studio",
    description: "No-code fine-tuning UI (Gemma, Qwen, DeepSeek). GPU fine-tuning in the browser.",
    archs: ["amd64", "arm64"],
    ui: { port: 8000, healthPath: "/" },
    side: "nvidia",
    icon: "api",
    install: {
      kind: "script",
      note: "Installs from unsloth.ai/install.sh (one-time apt dep needs sudo) — install from a terminal, then it appears here as a service.",
    },
  },
  {
    id: "comfyui",
    name: "ComfyUI",
    description: "Node-based image-generation studio (FLUX, SDXL, and more).",
    archs: ["amd64", "arm64"],
    ui: { port: 8188, healthPath: "/" },
    side: "primary",
    icon: "image",
    install: {
      kind: "script",
      note: "Native install on the Spark (GB10/aarch64 has no clean official ARM docker image). Use the NVIDIA dgx-spark ComfyUI playbook; it appears here once it's serving on :8188.",
    },
  },
  {
    id: "synapse",
    name: "Synapse",
    description: "Self-hostable messaging substrate for AI agents and humans — channels, threads, mentions.",
    archs: ["amd64", "arm64"],
    ui: { port: 8080, healthPath: "/" },
    side: "primary",
    icon: "message",
    install: {
      kind: "script",
      note: "Self-host with docker compose: clone MindStone-Agent/synapse and run scripts/quickstart.sh (sets the admin handle + secrets). It appears here once it's serving on :8080.",
    },
  },
];

export function toolById(id: string): Tool | undefined {
  return TOOLS.find((t) => t.id === id);
}
