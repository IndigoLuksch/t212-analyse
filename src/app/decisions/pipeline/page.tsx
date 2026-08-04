import { listPipelineTheses, listSwitcherInstruments } from "@/lib/analysis/portfolio";
import { PipelineClient } from "@/components/decisions/PipelineClient";

export default function PipelinePage() {
  const instruments = listSwitcherInstruments();
  const initialTheses = listPipelineTheses();

  return (
    <div className="space-y-10">
      <section className="space-y-2">
        <h2 className="text-base font-medium text-ink">Thesis pipeline</h2>
        <p className="text-sm text-muted">
          Write theses before buying. Review them on schedule.
        </p>
      </section>
      <PipelineClient instruments={instruments} initialTheses={initialTheses} />
    </div>
  );
}
