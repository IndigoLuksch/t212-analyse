"use client";

import { ChartCard, DivergingBars } from "@/components/charts";
import { useChartWidth } from "./chartUtils";

interface ContributionChartProps {
  contribution: {
    ticker: string;
    name: string;
    colorSlot: number | null;
    pnlGbp: number;
  }[];
  contributionStat: string | null;
}

export function ContributionChart({ contribution, contributionStat }: ContributionChartProps) {
  const { ref, width } = useChartWidth();

  const data = contribution.map((c) => ({
    id: c.ticker,
    name: c.name,
    value: c.pnlGbp,
  }));

  return (
    <div ref={ref}>
      <ChartCard
        title="Contribution"
        caption="Lifetime P&L by stock"
        captionMetric="profit"
      >
        <DivergingBars data={data} width={width} />
        {contributionStat && (
          <p className="mt-3 text-sm text-ink-secondary">{contributionStat}</p>
        )}
      </ChartCard>
    </div>
  );
}
