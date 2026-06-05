import { ServiceCard } from "../components/ServiceCard";
import { getServices } from "@/app/lib/config";

// Read cortex-config.json at request time so config edits apply without a rebuild.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Services — Cortex",
};

export default function ServicesPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="mb-10">
        <h2 className="text-3xl font-semibold tracking-tight text-ink-100">
          Local services
        </h2>
        <p className="mt-2 text-ink-400 max-w-2xl">
          Your local AI stack runs here. Inference, image generation, and the
          comms substrate live on your own hardware — local, private, and always available.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {getServices().map((s) => (
          <ServiceCard key={s.id} service={s} />
        ))}
      </div>
    </div>
  );
}
