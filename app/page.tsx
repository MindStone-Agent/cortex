import { SystemStats } from "./components/SystemStats";
import { LivePerf } from "./components/LivePerf";
import { ModelsList } from "./components/ModelsList";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="mb-10">
        <h2 className="text-3xl font-semibold tracking-tight text-ink-100">
          Dashboard
        </h2>
        <p className="mt-2 text-ink-400 max-w-2xl">
          Live view of the Spark — inference load, hardware health, model
          inventory.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SystemStats />
        <LivePerf />
        <div className="md:col-span-2">
          <ModelsList />
        </div>
      </div>
    </div>
  );
}
