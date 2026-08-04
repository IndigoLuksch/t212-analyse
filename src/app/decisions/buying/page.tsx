import { ChartCard } from "@/components/charts";
import { BuyTable } from "@/components/decisions/BuyTable";
import { ReplayLab } from "@/components/decisions/ReplayLab";
import { BuyTimingStrip } from "@/components/decisions/BuyTimingStrip";
import { EntryContextChart } from "@/components/decisions/EntryContextChart";
import { PostBuyCurveChart } from "@/components/decisions/PostBuyCurveChart";
import { StatTile } from "@/components/ui/StatTile";
import { computeBuying } from "@/lib/analysis/portfolio";
import { formatPct, formatRatio } from "@/lib/format/numbers";

export default function BuyingDecisionsPage() {
  const data = computeBuying();
  const { kpis } = data;

  return (
    <div className="space-y-10">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
          label="Adj. return at 1y"
          value={
            kpis.adj365 != null ? formatPct(kpis.adj365, { signed: true }) : "–"
          }
          metric="postBuyAdj"
        />
      </section>

      <ChartCard
        title="Post-buy return curve"
        caption="Index-adjusted cumulative return by horizon — zero means matched the index"
        titleMetric="postBuyCurve"
        table={
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-4">Horizon</th>
                <th className="py-2 pr-4">Adj return</th>
                <th className="py-2">n</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.curve.map((p) => (
                <tr key={p.horizonDays} className="border-b border-border">
                  <td className="py-2 pr-4">{p.label}</td>
                  <td className="py-2 pr-4">
                    {p.adj != null ? formatPct(p.adj, { signed: true }) : "–"}
                  </td>
                  <td className="py-2">{p.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <PostBuyCurveChart curve={data.curve} />
      </ChartCard>

      <ChartCard
        title="Entry context"
        caption="Adj return at 1y by market context bucket on the buy date"
        titleMetric="entryContext"
        table={
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-4">Dimension</th>
                <th className="py-2 pr-4">Bucket</th>
                <th className="py-2 pr-4">Adj 1y</th>
                <th className="py-2">n</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.contextBuckets
                .filter((b) => b.n > 0)
                .map((b) => (
                  <tr key={`${b.dimension}-${b.bucketId}`} className="border-b border-border">
                    <td className="py-2 pr-4">{b.dimensionLabel}</td>
                    <td className="py-2 pr-4">{b.bucketLabel}</td>
                    <td className="py-2 pr-4">
                      {b.adj365 != null ? formatPct(b.adj365, { signed: true }) : "–"}
                    </td>
                    <td className="py-2">{b.n}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        }
      >
        <EntryContextChart buckets={data.contextBuckets} />
      </ChartCard>

      <ChartCard
        title="Buy timing"
        caption="Index-adjusted return at 1y after each buy"
        titleMetric="postBuyAdj"
        table={
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-4">Stock</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2">Adj 1y</th>
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
        <BuyTimingStrip strip={data.strip} />
      </ChartCard>

      <BuyTable rows={data.buyRows} />

      <ReplayLab />
    </div>
  );
}
