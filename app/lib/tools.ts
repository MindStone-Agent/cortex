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
  side: "mindstone" | "nvidia";
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
    side: "mindstone",
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
];

export function toolById(id: string): Tool | undefined {
  return TOOLS.find((t) => t.id === id);
}
