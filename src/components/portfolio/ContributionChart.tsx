"use client";

import { ChartCard, DivergingBars, useChartSize } from "@/components/charts";

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
  return (
    <ChartCard
      title="Contribution"
      caption="Profit by stock"
      captionMetric="profit"
    >
      <ContributionPlot contribution={contribution} contributionStat={contributionStat} />
    </ChartCard>
  );
}
