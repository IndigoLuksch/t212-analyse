import { notFound } from "next/navigation";
import { DecompositionBar } from "@/components/charts";
import { ExitsSection } from "@/components/stock/ExitsSection";
import { StockChart } from "@/components/stock/StockChart";
import { MetricTip } from "@/components/ui/MetricTip";
import { StatChip } from "@/components/ui/StatChip";
import { YahooOverrideForm } from "@/components/YahooOverrideForm";
import { computeStock } from "@/lib/analysis/portfolio";
import { formatGbp, formatPct, formatRatio, formatShares, formatXirr } from "@/lib/format/numbers";

interface PageProps {
  params: Promise<{ ticker: string }>;
}

export default async function StockPage({ params }: PageProps) {
  const { ticker: raw } = await params;
  const ticker = decodeURIComponent(raw);
  const data = computeStock(ticker);
  if (!data) notFound();

  const { instrument, summary, keptAnnotation, exits } = data;

  const finalExitDate =
    !summary.isOpen && exits.length > 0 ? exits[exits.length - 1]!.exit.date : null;

  const chartCurrency =
    instrument.currency === "GBp" || instrument.currency === "GBX"
      ? "GBP"
      : instrument.currency;

  const decompSegments = [
    { id: "price" as const, label: "Price", value: summary.decomposition.priceGbp, color: "var(--slot-1)" },
    { id: "dividends" as const, label: "Dividends", value: summary.decomposition.dividendsGbp, color: "var(--slot-3)" },
    { id: "fx" as const, label: "FX", value: summary.decomposition.fxGbp, color: "var(--slot-4)" },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-medium text-ink">{instrument.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {instrument.ticker}
            {instrument.yahooSymbol && ` · ${instrument.yahooSymbol}`}
            {" · "}
            chart in {chartCurrency} · metrics in GBP
          </p>
        </div>
        {instrument.mappingFailed && (
          <YahooOverrideForm ticker={instrument.ticker} initialSymbol={instrument.yahooOverride} />
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <StatChip
            label="Value"
            value={summary.isOpen ? formatGbp(summary.valueGbp) : "closed"}
          />
          <StatChip label="Shares" value={formatShares(summary.shares)} />
          <StatChip
            label="P&L"
            value={
              <span className={summary.pnlGbp >= 0 ? "text-positive" : "text-negative"}>
                {formatGbp(summary.pnlGbp, { signed: true })} (
                {formatPct(summary.totalReturn, { signed: true })})
              </span>
            }
            metric="profit"
          />
          <StatChip
            label={summary.suppressAnnualised ? "Return (total)" : "Return /yr"}
            value={
              summary.suppressAnnualised
                ? formatPct(summary.totalReturn, { signed: true })
                : formatXirr(summary.xirr, summary.suppressAnnualised)
            }
            metric={summary.suppressAnnualised ? "totalReturn" : "xirr"}
          />
          <StatChip label="Hold" value={`${summary.holdYears.toFixed(1)}y`} />
          <StatChip
            label="Buy discipline"
            value={summary.buyDiscipline != null ? formatRatio(summary.buyDiscipline) : "–"}
            metric="buyDiscipline"
          />
          <StatChip
            label="Worst point"
            value={
              summary.worstPoint
                ? formatPct(summary.worstPoint.drawdown, { signed: true })
                : "–"
            }
            metric="worstPoint"
          />
          <StatChip
            label="Dividends"
            value={formatGbp(summary.dividendsGbp)}
            metric="dividendsReceived"
          />
        </div>
      </header>

      <StockChart
        prices={data.prices}
        avgCostSeries={data.avgCostSeries}
        holdingsDaily={data.holdingsDaily}
        monthlyFlow={data.monthlyFlow}
        orders={data.orders}
        divEvents={data.divEvents}
        tranches={data.tranches.tranches}
        exits={data.exits}
        notes={data.notes}
        finalExitDate={finalExitDate}
        keptAnnotation={keptAnnotation}
        heldRange={data.heldRange}
        chartCurrency={chartCurrency}
      />

      <ExitsSection exits={data.exits} notes={data.notes} />

      <section className="space-y-2">
        <h2 className="inline-flex items-center gap-1 text-base font-medium text-ink">
          Decomposition
          <MetricTip metric="decomposition" />
        </h2>
        <DecompositionBar segments={decompSegments} />
      </section>
    </div>
  );
}
