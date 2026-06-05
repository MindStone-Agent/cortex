import { ServiceCard } from "../components/ServiceCard";
import services from "@/data/services.json";

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
          MindStone Agent runs on this Spark. Inference, image generation,
          voice and the comms substrate live here — local, private, and always available.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {services.services.map((s) => (
          <ServiceCard key={s.id} service={s as never} />
        ))}
      </div>
    </div>
  );
}
