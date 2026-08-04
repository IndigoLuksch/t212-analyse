import { EmptyState } from "@/components/EmptyState";
import { PortfolioCharts } from "@/components/portfolio/PortfolioCharts";
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
          className={`inline-flex items-center gap-2 text-5xl font-medium tracking-tight ${
            hero.pnlGbp >= 0 ? "text-positive" : "text-negative"
          }`}
        >
          {formatGbp(hero.pnlGbp, { signed: true })}
          <MetricTip metric="profit" />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-secondary">
          {/* XIRR is the annualised rate — money-weighted, so it accounts for
              when each contribution actually went to work. The cumulative
              figure trails it as context, carrying the span it covers. */}
          <span
            className={`inline-flex items-center gap-1 ${
              hero.totalReturn >= 0 ? "text-positive" : "text-negative"
            }`}
          >
            {hero.suppressAnnualised
              ? `${formatPct(hero.annualisedReturn, { signed: true })}/yr`
              : `${formatXirr(hero.xirr, false)}/yr`}{" "}
            on your money
            <MetricTip metric="xirr" />
          </span>
          <span className="text-muted">·</span>
          {/* The two rates answer different questions and the gap between them
              is the point: TWR is what the holdings earned, XIRR is what the
              money earned, and the difference is contribution timing. */}
          {hero.twrAnnualised != null && (
            <>
              <span className="text-muted">·</span>
              <span className="inline-flex items-center gap-1 text-muted">
                {formatPct(hero.twrAnnualised, { signed: true })}/yr on holdings
                <MetricTip metric="twr" />
              </span>
            </>
          )}
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
                <MetricTip metric="pickingEdge" />
              </span>
            </>
          )}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <StatTile label="Current value" value={formatGbp(kpis.currentValue)} />
        <StatTile
          label="Dividends"
          value={formatGbp(kpis.dividendsGbp)}
          metric="dividendsReceived"
        />
        <StatTile
          label="Win rate"
          value={kpis.winRate != null ? formatPct(kpis.winRate) : "–"}
          sub="closed round trips"
          metric="winRate"
        />
      </section>

      <p className="text-sm text-muted">Metrics in GBP · experienced returns net of fees</p>

      <PortfolioCharts
        valueSeries={data.valueSeries}
        investedSeries={data.investedSeries}
        twr={data.twr}
        benchTwr={data.benchTwr}
        sp500Twr={data.sp500Twr}
        allocation={data.allocation}
        tickerMeta={data.tickerMeta}
        scatter={data.scatter}
        excludedScatter={excludedScatter}
        benchmarkXirr={data.replayBenchmarkXirr}
        sp500Xirr={data.replaySp500Xirr}
        contribution={data.contribution}
        contributionStat={data.contributionStat}
        positions={data.positions}
      />
    </div>
  );
}
