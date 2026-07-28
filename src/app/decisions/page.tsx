import { ChartCard } from "@/components/charts";
import { ClosedTripsTable } from "@/components/decisions/ClosedTripsTable";
import { ExitTable } from "@/components/decisions/ExitTable";
import { SellTimingStrip } from "@/components/decisions/SellTimingStrip";
import { MetricTip } from "@/components/ui/MetricTip";
import { StatTile } from "@/components/ui/StatTile";
import { computeDecisions } from "@/lib/analysis/portfolio";
import { formatGbp, formatPct } from "@/lib/format/numbers";

export default function DecisionsPage() {
  const data = computeDecisions();
  const { kpis } = data;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-medium text-ink">Decisions</h1>
        <p className="mt-1 text-sm text-muted">Trade-quality review</p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Median adj. 6m post-sell"
          value={
            kpis.medianAdj6m != null ? formatPct(kpis.medianAdj6m, { signed: true }) : "–"
          }
          sub={
            <MetricTip
              label="Median adj. 6m"
              definition="Median index-adjusted return 6 months after each exit."
            />
          }
        />
        <StatTile
          label="Averaging down"
          value={
            kpis.averagingDown.n > 0 && kpis.averagingDown.return != null
              ? formatPct(kpis.averagingDown.return, { signed: true })
              : "–"
          }
          sub={`${kpis.averagingDown.n} tranches`}
        />
        <StatTile
          label="Averaging up"
          value={
            kpis.averagingUp.n > 0 && kpis.averagingUp.return != null
              ? formatPct(kpis.averagingUp.return, { signed: true })
              : "–"
          }
          sub={`${kpis.averagingUp.n} tranches`}
        />
        <StatTile
          label="Buy discipline"
          value={
            kpis.medianBuyDiscipline != null
              ? formatPct(kpis.medianBuyDiscipline)
              : "–"
          }
          sub={
            <MetricTip
              label="Buy discipline"
              definition="Median ratio of buy price to prior peak — lower means better timing."
            />
          }
        />
        <StatTile
          label="Money left on table"
          value={formatGbp(kpis.ghostAggregate, { signed: true })}
          sub={
            <MetricTip
              label="Ghost aggregate"
              definition="Sum of kept-vs-sold deltas across all exits — positive means you left money on the table."
            />
          }
        />
      </section>

      <ChartCard title="Sell timing" caption="Index-adjusted 6m post-exit return">
        <SellTimingStrip strip={data.strip} />
      </ChartCard>

      <ExitTable rows={data.exitRows} />

      <ClosedTripsTable
        trips={data.closedTrips}
        winRate={data.winRate}
        profitFactor={data.profitFactor}
      />
    </div>
  );
}
