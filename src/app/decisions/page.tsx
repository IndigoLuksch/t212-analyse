import { ChartCard } from "@/components/charts";
import { ClosedTripsTable } from "@/components/decisions/ClosedTripsTable";
import { ExitTable } from "@/components/decisions/ExitTable";
import { SellTimingStrip } from "@/components/decisions/SellTimingStrip";
import { StatTile } from "@/components/ui/StatTile";
import { computeDecisions } from "@/lib/analysis/portfolio";
import { formatGbp, formatPct, formatRatio } from "@/lib/format/numbers";

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
          metric="medianAdj6m"
        />
        <StatTile
          label="Averaging down"
          value={
            kpis.averagingDown.n > 0 && kpis.averagingDown.return != null
              ? formatPct(kpis.averagingDown.return, { signed: true })
              : "–"
          }
          sub={`${kpis.averagingDown.n} tranches`}
          metric="averagingDown"
        />
        <StatTile
          label="Averaging up"
          value={
            kpis.averagingUp.n > 0 && kpis.averagingUp.return != null
              ? formatPct(kpis.averagingUp.return, { signed: true })
              : "–"
          }
          sub={`${kpis.averagingUp.n} tranches`}
          metric="averagingUp"
        />
        <StatTile
          label="Buy discipline"
          value={
            kpis.medianBuyDiscipline != null
              ? formatRatio(kpis.medianBuyDiscipline)
              : "–"
          }
          metric="buyDiscipline"
        />
        <StatTile
          label="Money left on table"
          value={formatGbp(kpis.ghostAggregate, { signed: true })}
          metric="moneyLeftOnTable"
        />
      </section>

      <ChartCard title="Sell timing" caption="Index-adjusted 6m post-exit return" table={
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 pr-4">Stock</th>
              <th className="py-2 pr-4">Date</th>
              <th className="py-2">Adj 6m</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {[...data.strip]
              .sort((a, b) => a.value - b.value)
              .map((p) => (
                <tr key={`${p.ticker}-${p.date}`} className="border-b border-border">
                  <td className="py-2 pr-4">{p.name}</td>
                  <td className="py-2 pr-4">{p.date}</td>
                  <td className="py-2">{formatPct(p.value, { signed: true })}</td>
                </tr>
              ))}
          </tbody>
        </table>
      }>
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
