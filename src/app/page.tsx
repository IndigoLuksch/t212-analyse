import { EmptyState } from "@/components/EmptyState";
import { AllocationChart } from "@/components/portfolio/AllocationChart";
import { ContributionChart } from "@/components/portfolio/ContributionChart";
import { HoldingsTable } from "@/components/portfolio/HoldingsTable";
import { PerformanceChart } from "@/components/portfolio/PerformanceChart";
import { ScatterHoldingsChart } from "@/components/portfolio/ScatterHoldingsChart";
import { ValueInvestedChart } from "@/components/portfolio/ValueInvestedChart";
import { MetricTip } from "@/components/ui/MetricTip";
import { StatTile } from "@/components/ui/StatTile";
import { computePortfolio, hasAnyData } from "@/lib/analysis/portfolio";
import { formatGbp, formatPct, formatXirr } from "@/lib/format/numbers";

export default function PortfolioPage() {
  if (!hasAnyData()) {
    return <EmptyState />;
  }

  const data = computePortfolio();
  const { hero, kpis } = data;
  const excludedScatter = data.positions.filter((p) => p.suppressAnnualised).length;

  const pickingEdgeText =
    hero.pickingEdge != null
      ? `${formatPct(hero.pickingEdge, { signed: true })}/yr vs All-World replay`
      : null;
  const pickingEdgeClass =
    hero.pickingEdge != null
      ? hero.pickingEdge >= 0
        ? "text-positive"
        : "text-negative"
      : "text-ink-secondary";

  return (
    <div className="space-y-10">
      <section className="space-y-2">
        <div
          className={`text-5xl font-medium tracking-tight ${
            hero.pnlGbp >= 0 ? "text-positive" : "text-negative"
          }`}
        >
          {formatGbp(hero.pnlGbp, { signed: true })}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-secondary">
          <span className={hero.totalReturn >= 0 ? "text-positive" : "text-negative"}>
            {formatPct(hero.totalReturn, { signed: true })} total return
          </span>
          <span className="text-muted">·</span>
          <span>{formatXirr(hero.xirr, hero.suppressAnnualised)} XIRR</span>
          {pickingEdgeText && (
            <>
              <span className="text-muted">·</span>
              <span className={`inline-flex items-center gap-1 ${pickingEdgeClass}`}>
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      hero.pickingEdge! >= 0 ? "var(--positive)" : "var(--negative)",
                  }}
                />
                {pickingEdgeText}
                <MetricTip
                  label="Picking edge"
                  definition="What the same money, moved on the same days, would have earned in a world tracker."
                />
              </span>
            </>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Current value" value={formatGbp(kpis.currentValue)} />
        <StatTile label="Invested" value={formatGbp(kpis.invested)} sub="net" />
        <StatTile label="Realised P&L" value={formatGbp(kpis.realisedPnL, { signed: true })} />
        <StatTile label="Dividends" value={formatGbp(kpis.dividendsGbp)} />
        <StatTile
          label="Win rate"
          value={kpis.winRate != null ? formatPct(kpis.winRate) : "–"}
          sub="closed round trips"
        />
      </section>

      <p className="text-sm text-muted">Metrics in GBP · experienced returns net of fees</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <ValueInvestedChart
          valueSeries={data.valueSeries}
          investedSeries={data.investedSeries}
        />
        <PerformanceChart twr={data.twr} benchTwr={data.benchTwr} />
        <AllocationChart
          allocation={data.allocation}
          valueSeries={data.valueSeries}
          tickerMeta={data.tickerMeta}
        />
        <ScatterHoldingsChart
          points={data.scatter}
          excludedCount={excludedScatter}
          benchmarkXirr={data.replayBenchmarkXirr}
        />
        <ContributionChart
          contribution={data.contribution}
          contributionStat={data.contributionStat}
        />
        <div className="lg:col-span-2">
          <HoldingsTable positions={data.positions} />
        </div>
      </div>
    </div>
  );
}
