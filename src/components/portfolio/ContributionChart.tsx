"use client";

import { ChartCard, DivergingBars, useChartSize } from "@/components/charts";
import { formatTooltipGbp } from "@/components/charts/format";

interface ContributionChartProps {
  contribution: {
    ticker: string;
    name: string;
    colorSlot: number | null;
    pnlGbp: number;
  }[];
  contributionStat: string | null;
}

function ContributionPlot({
  contribution,
  contributionStat,
}: ContributionChartProps) {
  const { width } = useChartSize();

  const data = contribution.map((c) => ({
    id: c.ticker,
    name: c.name,
    value: c.pnlGbp,
  }));

  return (
    <>
      <DivergingBars data={data} width={width} />
      {contributionStat && (
        <p className="mt-3 text-sm text-ink-secondary">{contributionStat}</p>
      )}
    </>
  );
}

export function ContributionChart({ contribution, contributionStat }: ContributionChartProps) {
  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted">
          <th className="py-2 pr-4">Stock</th>
          <th className="py-2">Profit</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {contribution.map((c) => (
          <tr key={c.ticker} className="border-b border-border">
            <td className="py-2 pr-4">{c.name}</td>
            <td className="py-2">{formatTooltipGbp(c.pnlGbp, true)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      title="Contribution"
      caption="Profit by stock"
      captionMetric="profit"
      table={table}
    >
      <ContributionPlot contribution={contribution} contributionStat={contributionStat} />
    </ChartCard>
  );
}
