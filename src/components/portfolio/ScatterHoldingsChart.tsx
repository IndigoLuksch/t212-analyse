"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  ChartCard,
  Legend,
  ScatterPlot,
  XAxisLinear,
  YAxis,
  createLinearScale,
  niceLinearDomain,
  useChartSize,
} from "@/components/charts";
import { formatAxisPct } from "@/components/charts/Axes";
import { formatTooltipGbp, formatTooltipPct } from "@/components/charts/format";
import { MetricTip } from "@/components/ui/MetricTip";

interface ScatterHoldingsChartProps {
  points: {
    ticker: string;
    name: string;
    years: number;
    xirr: number;
    capital: number;
    isOpen: boolean;
  }[];
  excludedCount: number;
  benchmarkXirr: number | null;
  sp500Xirr: number | null;
}

const MARGINS = { top: 12, right: 16, bottom: 32, left: 52 };

const stockHref = (ticker: string) => `/stocks/${encodeURIComponent(ticker)}`;

function ScatterPlotBody({
  points,
  benchmarkXirr,
  sp500Xirr,
}: {
  points: ScatterHoldingsChartProps["points"];
  benchmarkXirr: number | null;
  sp500Xirr: number | null;
}) {
  const { width, height } = useChartSize();
  const router = useRouter();
  const plotW = width - MARGINS.left - MARGINS.right;
  const plotH = height - MARGINS.top - MARGINS.bottom;

  const scatterPoints = useMemo(
    () =>
      points.map((p) => ({
        id: p.ticker,
        name: p.name,
        x: p.years,
        y: p.xirr,
        size: p.capital,
        open: p.isOpen,
        // Legend: open = slot-1, closed = muted — identity colour is for series charts.
        color: p.isOpen ? "var(--slot-1)" : "var(--muted)",
      })),
    [points],
  );

  const xScale = useMemo(() => {
    const xs = points.map((p) => p.years);
    return createLinearScale(niceLinearDomain(xs.length ? xs : [0, 5]), [0, plotW]);
  }, [points, plotW]);

  const references = useMemo(
    () =>
      [
        benchmarkXirr != null
          ? { value: benchmarkXirr, label: "All-World XIRR", color: "var(--baseline)" }
          : null,
        sp500Xirr != null
          ? { value: sp500Xirr, label: "S&P 500 XIRR", color: "var(--slot-4)" }
          : null,
      ].filter((r): r is { value: number; label: string; color: string } => r !== null),
    [benchmarkXirr, sp500Xirr],
  );

  const yScale = useMemo(() => {
    const ys = points.map((p) => p.xirr);
    const refs = references.map((r) => r.value);
    const domain = niceLinearDomain(
      ys.length ? [...ys, ...(refs.length ? refs : [0])] : [-0.1, 0.3],
    );
    return createLinearScale(domain, [plotH, 0]);
  }, [points, references, plotH]);

  return (
    <svg width={width} height={height}>
      <g transform={`translate(${MARGINS.left},${MARGINS.top})`}>
        <YAxis scale={yScale} height={plotH} format={formatAxisPct} width={plotW} />
        <g transform={`translate(0,${plotH})`}>
          <XAxisLinear scale={xScale} width={plotW} format={(n) => `${n.toFixed(1)}y`} />
        </g>
        <ScatterPlot
          points={scatterPoints}
          xScale={xScale}
          yScale={yScale}
          width={plotW}
          height={plotH}
          references={references}
          onPointClick={(ticker) => router.push(stockHref(ticker))}
        />
      </g>
    </svg>
  );
}

export function ScatterHoldingsChart({
  points,
  excludedCount,
  benchmarkXirr,
  sp500Xirr,
}: ScatterHoldingsChartProps) {
  const caption =
    excludedCount > 0
      ? `${excludedCount} short hold${excludedCount === 1 ? "" : "s"} excluded — too brief to annualise`
      : "Hold time × annual return";

  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted">
          <th className="py-2 pr-4">Stock</th>
          <th className="py-2 pr-4">Hold</th>
          <th className="py-2 pr-4">XIRR</th>
          <th className="py-2 pr-4">Capital</th>
          <th className="py-2">Status</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {[...points]
          .sort((a, b) => b.capital - a.capital)
          .map((p) => (
            <tr key={p.ticker} className="border-b border-border hover:bg-page">
              <td className="py-2 pr-4">
                <Link href={stockHref(p.ticker)} className="text-ink hover:underline">
                  {p.name}
                </Link>
              </td>
              <td className="py-2 pr-4">{p.years.toFixed(1)}y</td>
              <td className="py-2 pr-4">{formatTooltipPct(p.xirr)}</td>
              <td className="py-2 pr-4">{formatTooltipGbp(p.capital)}</td>
              <td className="py-2">{p.isOpen ? "Open" : "Closed"}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      title="Hold time × annual return"
      caption={caption}
      titleMetric="xirr"
      captionMetric="dotArea"
      table={table}
    >
      <Legend
        items={[
          { id: "open", name: "Open", color: "var(--slot-1)", mark: "dot" },
          { id: "closed", name: "Closed", color: "var(--muted)", mark: "dot" },
          ...(benchmarkXirr != null
            ? [
                {
                  id: "bench",
                  name: (
                    <span className="inline-flex items-center gap-1">
                      All-World XIRR
                      <MetricTip metric="benchmarkXirr" />
                    </span>
                  ),
                  color: "var(--baseline)",
                  mark: "line" as const,
                },
              ]
            : []),
          ...(sp500Xirr != null
            ? [
                {
                  id: "sp500",
                  name: "S&P 500 XIRR",
                  color: "var(--slot-4)",
                  mark: "line" as const,
                },
              ]
            : []),
        ]}
        className="mb-3"
      />
      <ScatterPlotBody points={points} benchmarkXirr={benchmarkXirr} sp500Xirr={sp500Xirr} />
    </ChartCard>
  );
}
