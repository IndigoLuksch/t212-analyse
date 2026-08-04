"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChartCard, DivergingBars, useChartSize } from "@/components/charts";
import { formatTooltipGbp } from "@/components/charts/format";

const stockHref = (ticker: string) => `/stocks/${encodeURIComponent(ticker)}`;

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
  const router = useRouter();

  const data = contribution.map((c) => ({
    id: c.ticker,
    name: c.name,
    value: c.pnlGbp,
  }));

  return (
    <>
      <DivergingBars
        data={data}
        width={width}
        onBarClick={(ticker) => router.push(stockHref(ticker))}
      />
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
          <tr key={c.ticker} className="border-b border-border hover:bg-page">
            <td className="py-2 pr-4">
              <Link href={stockHref(c.ticker)} className="text-ink hover:underline">
                {c.name}
              </Link>
            </td>
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
