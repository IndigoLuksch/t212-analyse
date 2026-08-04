import Link from "next/link";
import { notFound } from "next/navigation";
import { ConstituentGrid } from "@/components/pies/ConstituentGrid";
import { DriftTable } from "@/components/pies/DriftTable";
import { IndexedLinesChart } from "@/components/pies/IndexedLinesChart";
import { PieValueChart } from "@/components/pies/PieValueChart";
import { StatTile } from "@/components/ui/StatTile";
import { computePie } from "@/lib/analysis/pies";
import { formatGbp, formatPct, formatXirr } from "@/lib/format/numbers";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PieDetailPage({ params }: PageProps) {
  const { id } = await params;
  const pieId = Number(id);
  if (!Number.isFinite(pieId)) notFound();

  const data = computePie(pieId);
  if (!data) notFound();

  const { pie, totals, constituents, reported } = data;
  const lastPie = data.twr.at(-1)?.index ?? 100;
  const lastTarget = data.targetBlendTwr.at(-1)?.index ?? 100;
  const lastBench = data.benchTwr.at(-1)?.index ?? 100;

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div>
          <Link href="/pies" className="text-sm text-muted hover:underline">
            ← Pies
          </Link>
          <h1 className="mt-1 text-2xl font-medium text-ink">{pie.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {pie.accountId} account · created {pie.createdAt} · {constituents.length} holdings
            {pie.dividendCashAction && ` · dividends ${pie.dividendCashAction.toLowerCase()}`}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Value" value={formatGbp(totals.valueGbp)} />
        <StatTile
          label="Profit"
          value={
            <span className={totals.pnlGbp >= 0 ? "text-positive" : "text-negative"}>
              {formatGbp(totals.pnlGbp, { signed: true })}
            </span>
          }
        />
        {/* One annualised rate, not two: XIRR weights each contribution by how
            long it was invested, which is what makes a pie fed by a monthly
            autoinvest comparable to a benchmark. */}
        <StatTile
          label="Return / yr"
          value={
            totals.xirr != null
              ? formatXirr(totals.xirr, false)
              : formatPct(totals.annualisedReturn, { signed: true })
          }
          metric="xirr"
          sub={`${formatPct(totals.totalReturn, { signed: true })} total over ${totals.holdYears.toFixed(1)}y`}
        />
        <StatTile
          label="vs target blend"
          value={
            <span className={lastPie >= lastTarget ? "text-positive" : "text-negative"}>
              {`${lastPie - lastTarget >= 0 ? "+" : ""}${(lastPie - lastTarget).toFixed(1)} pts`}
            </span>
          }
          sub="TWR points vs perfect rebalancing"
        />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Cost basis" value={formatGbp(totals.investedGbp)} />
        <StatTile label="Net cash in" value={formatGbp(totals.netCashGbp)} />
        <StatTile label="Max drift" value={`${totals.maxDriftPp.toFixed(2)}pp`} />
        <StatTile label="Uninvested cash" value={formatGbp(pie.cash ?? 0)} />
      </section>

      <PieValueChart
        valueSeries={data.valueSeries}
        investedSeries={data.investedSeries}
      />

      <IndexedLinesChart
        title="Pie vs benchmarks"
        caption={`TWR indexed to 100 at ${pie.createdAt} · pie ${lastPie.toFixed(1)} vs All-World ${lastBench.toFixed(1)}`}
        series={[
          { id: "pie", name: pie.name, color: "var(--slot-1)", points: data.twr },
          { id: "bench", name: "All-World", color: "var(--muted)", points: data.benchTwr },
          { id: "sp500", name: "S&P 500", color: "var(--slot-4)", points: data.sp500Twr },
        ]}
      />

      <IndexedLinesChart
        title="Pie vs its own weighting"
        caption="What the same holdings would have returned rebalanced continuously to target, and to today's actual weights"
        series={[
          { id: "pie", name: pie.name, color: "var(--slot-1)", points: data.twr },
          {
            id: "target",
            name: "Target weights",
            color: "var(--slot-3)",
            points: data.targetBlendTwr,
          },
          {
            id: "actual",
            name: "Actual weights",
            color: "var(--slot-6)",
            points: data.actualBlendTwr,
          },
        ]}
      />

      <DriftTable constituents={constituents} />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-ink">Holdings</h2>
          <p className="mt-1 text-sm text-muted">
            Each rebased to 100 at the pie&apos;s creation date, against the same benchmarks
          </p>
        </div>
        <ConstituentGrid
          constituents={constituents}
          benchTwr={data.benchTwr}
          sp500Twr={data.sp500Twr}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium text-ink">Reconciliation</h2>
          <p className="mt-1 text-sm text-muted">
            T212 exposes no pie history and no pie id on orders, so holdings are
            reconstructed from order history. These are the reconstruction&apos;s own
            figures checked against what T212 reports today.
          </p>
        </div>
        <div className="rounded-lg border border-border p-4 text-sm">
          <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Share counts match T212</dt>
              <dd className={reported.sharesReconcile ? "text-positive" : "text-negative"}>
                {reported.sharesReconcile ? "all exact" : "mismatch"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Value (reconstructed / T212)</dt>
              <dd className="tabular">
                {formatGbp(totals.valueGbp)} / {formatGbp(reported.valueGbp ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Cost basis (reconstructed / T212)</dt>
              <dd className="tabular">
                {formatGbp(totals.investedGbp)} / {formatGbp(reported.investedGbp ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Uninvested pie cash</dt>
              <dd className="tabular">{formatGbp(pie.cash ?? 0)}</dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-border pt-3 text-[13px] text-muted">
            Share counts reconcile exactly. Value differs by the staleness of the last
            close versus T212&apos;s live quote. Cost basis can run high while a
            pre-pie holding of the same instrument is still being wound down, because
            nothing in the order data separates a top-up of that holding from a pie
            contribution.
          </p>
        </div>
      </section>
    </div>
  );
}
