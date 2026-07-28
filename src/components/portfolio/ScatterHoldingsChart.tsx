"use client";

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
}

const MARGINS = { top: 12, right: 16, bottom: 32, left: 52 };

function ScatterPlotBody({
  points,
  benchmarkXirr,
}: {
  points: ScatterHoldingsChartProps["points"];
  benchmarkXirr: number | null;
}) {
  const { width, height } = useChartSize();
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

  const yScale = useMemo(() => {
    const ys = points.map((p) => p.xirr);
    const ref = benchmarkXirr ?? 0;
    const domain = niceLinearDomain(ys.length ? [...ys, ref] : [-0.1, 0.3]);
    return createLinearScale(domain, [plotH, 0]);
  }, [points, benchmarkXirr, plotH]);

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
          referenceY={benchmarkXirr ?? undefined}
          referenceLabel={benchmarkXirr != null ? "benchmark XIRR" : undefined}
        />
      </g>
    </svg>
  );
}

export function ScatterHoldingsChart({
  points,
  excludedCount,
  benchmarkXirr,
}: ScatterHoldingsChartProps) {
  const caption =
    excludedCount > 0
      ? `${excludedCount} short hold${excludedCount === 1 ? "" : "s"} excluded — too brief to annualise`
      : "Hold time × annual return";

  return (
    <ChartCard
      title="Hold time × annual return"
      caption={caption}
      titleMetric="xirr"
      captionMetric="dotArea"
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
                      benchmark XIRR
                      <MetricTip metric="benchmarkXirr" />
                    </span>
                  ),
                  color: "var(--ink-secondary)",
                  mark: "line" as const,
                },
              ]
            : []),
        ]}
        className="mb-3"
      />
      <ScatterPlotBody points={points} benchmarkXirr={benchmarkXirr} />
    </ChartCard>
  );
}
