"use client";

import { useMemo } from "react";
import {
  ChartCard,
  ChartPlot,
  DEFAULT_MARGINS,
  Legend,
  LineSeries,
  XAxis,
  YAxis,
  createLinearScale,
  createTimeScale,
  niceLinearDomain,
  timeExtent,
  useChartSize,
} from "@/components/charts";
import { formatAxisNumber } from "@/components/charts/format";
import { toDatePoints } from "./chartUtils";

interface PerformanceChartProps {
  twr: { date: string; index: number }[];
  benchTwr: { date: string; index: number }[];
}

function PerformancePlot({ twr, benchTwr }: PerformanceChartProps) {
  const { width, height } = useChartSize();

  const actualData = useMemo(
    () => toDatePoints(twr.map((d) => ({ date: d.date, value: d.index }))),
    [twr],
  );
  const benchData = useMemo(
    () => toDatePoints(benchTwr.map((d) => ({ date: d.date, value: d.index }))),
    [benchTwr],
  );
  const dates = useMemo(() => actualData.map((d) => d.date), [actualData]);

  const margins = DEFAULT_MARGINS;
  const plotW = width - margins.left - margins.right;
  const plotH = height - margins.top - margins.bottom;

  const xScale = useMemo(
    () => createTimeScale(timeExtent(dates.length ? dates : [new Date()]), [0, plotW]),
    [dates, plotW],
  );

  const yScale = useMemo(() => {
    const vals = [...actualData, ...benchData].map((d) => d.value);
    return createLinearScale(niceLinearDomain(vals.length ? vals : [90, 110]), [plotH, 0]);
  }, [actualData, benchData, plotH]);

  return (
    <>
      <Legend
        items={[
          { id: "actual", name: "Portfolio", color: "var(--slot-1)", mark: "line" },
          { id: "bench", name: "All-World", color: "var(--muted)", mark: "line" },
        ]}
        className="mb-3"
      />
      <ChartPlot
        width={width}
        height={height}
        dates={dates}
        xScale={xScale}
        margins={margins}
        leftAxis={
          <YAxis
            scale={yScale}
            height={plotH}
            format={formatAxisNumber}
            width={plotW}
          />
        }
        bottomAxis={<XAxis scale={xScale} width={plotW} />}
      >
        {() => (
          <>
            <LineSeries
              data={actualData}
              xScale={xScale}
              yScale={yScale}
              seriesId="actual"
              seriesName="Portfolio"
              formatValue={(v) => v.toFixed(1)}
            />
            {benchData.length > 0 && (
              <LineSeries
                data={benchData}
                xScale={xScale}
                yScale={yScale}
                color="var(--muted)"
                seriesId="bench"
                seriesName="All-World"
                formatValue={(v) => v.toFixed(1)}
              />
            )}
          </>
        )}
      </ChartPlot>
    </>
  );
}

export function PerformanceChart({ twr, benchTwr }: PerformanceChartProps) {
  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted">
          <th className="py-2 pr-4">Date</th>
          <th className="py-2 pr-4">Portfolio</th>
          <th className="py-2">Benchmark</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {[...twr].reverse().slice(0, 30).map((row) => {
          const bench = benchTwr.find((d) => d.date === row.date);
          return (
            <tr key={row.date} className="border-b border-border">
              <td className="py-2 pr-4">{row.date}</td>
              <td className="py-2 pr-4">{row.index.toFixed(1)}</td>
              <td className="py-2">{bench ? bench.index.toFixed(1) : "–"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      title="Performance vs benchmark"
      caption="TWR indexed to 100 at first trade date"
      titleMetric="twr"
      captionMetric="benchmark"
      table={table}
    >
      <PerformancePlot twr={twr} benchTwr={benchTwr} />
    </ChartCard>
  );
}
