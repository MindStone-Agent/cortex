import { ModelBrowser } from "../components/ModelBrowser";

// Client-driven; no server data to prerender.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Models — Cortex",
};

export default function ModelsPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="mb-8">
        <h2 className="text-3xl font-semibold tracking-tight text-ink-100">Models</h2>
        <p className="mt-2 text-ink-400 max-w-2xl">
          Discover and pull models onto your stack — search the Ollama library and Hugging Face,
          then pull straight to your local Ollama with live progress. Your installed models live on
          the dashboard.
        </p>
      </div>
      <ModelBrowser />
    </div>
  );
}
