import { ChartCard } from "@/components/charts";
import { ClosedTripsTable } from "@/components/decisions/ClosedTripsTable";
import { ExitTable } from "@/components/decisions/ExitTable";
import { SellTimingStrip } from "@/components/decisions/SellTimingStrip";
import { StatTile } from "@/components/ui/StatTile";
import { computeDecisions } from "@/lib/analysis/portfolio";
import { formatGbp, formatPct } from "@/lib/format/numbers";

export default function SellingDecisionsPage() {
  const data = computeDecisions();
  const { kpis } = data;

  return (
    <div className="space-y-10">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Median adj. ann. post-sell"
          value={
            kpis.medianAdjAnn != null ? formatPct(kpis.medianAdjAnn, { signed: true }) : "–"
          }
          metric="medianAdjAnn"
        />
        <StatTile
          label="Money left on table"
          value={formatGbp(kpis.ghostAggregate, { signed: true })}
          metric="moneyLeftOnTable"
        />
        <StatTile
          label="Win rate"
          value={data.winRate != null ? formatPct(data.winRate) : "–"}
          metric="winRate"
        />
        <StatTile
          label="Profit factor"
          value={data.profitFactor != null ? data.profitFactor.toFixed(2) : "–"}
          metric="profitFactor"
        />
      </section>

      <ChartCard
        title="Sell timing"
        caption="Index-adjusted annualised post-exit return"
        table={
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-4">Stock</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2">Adj ann.</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {[...data.strip]
                .sort((a, b) => a.value - b.value)
                .map((p) => (
                  <tr key={p.id} className="border-b border-border">
                    <td className="py-2 pr-4">{p.name}</td>
                    <td className="py-2 pr-4">{p.date}</td>
                    <td className="py-2">{formatPct(p.value, { signed: true })}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        }
      >
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
