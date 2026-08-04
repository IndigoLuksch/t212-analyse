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
import { toDatePoints } from "@/components/portfolio/chartUtils";

export interface IndexedSeries {
  id: string;
  name: string;
  color: string;
  points: { date: string; index: number }[];
}

interface IndexedLinesChartProps {
  title: string;
  caption: string;
  series: IndexedSeries[];
}

function IndexedLinesPlot({ series }: { series: IndexedSeries[] }) {
  const { width, height } = useChartSize();

  const data = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        data: toDatePoints(s.points.map((p) => ({ date: p.date, value: p.index }))),
      })),
    [series],
  );

  // The x-domain comes from the longest series so a short one does not clip the
  // axis, and every line is drawn against the same time scale.
  const dates = useMemo(() => {
    const longest = data.reduce<(typeof data)[number] | null>(
      (best, s) => (best === null || s.data.length > best.data.length ? s : best),
      null,
    );
    return longest?.data.map((d) => d.date) ?? [];
  }, [data]);

  const margins = DEFAULT_MARGINS;
  const plotW = width - margins.left - margins.right;
  const plotH = height - margins.top - margins.bottom;

  const xScale = useMemo(
    () => createTimeScale(timeExtent(dates.length ? dates : [new Date()]), [0, plotW]),
    [dates, plotW],
  );

  const yScale = useMemo(() => {
    const vals = data.flatMap((s) => s.data.map((d) => d.value));
    return createLinearScale(
      niceLinearDomain(vals.length ? vals : [90, 110]),
      [plotH, 0],
    );
  }, [data, plotH]);

  return (
    <>
      <Legend
        items={series.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          mark: "line" as const,
        }))}
        className="mb-3"
      />
      <ChartPlot
        width={width}
        height={height}
        dates={dates}
        xScale={xScale}
        margins={margins}
        leftAxis={
          <YAxis scale={yScale} height={plotH} format={formatAxisNumber} width={plotW} />
        }
        bottomAxis={<XAxis scale={xScale} width={plotW} />}
      >
        {() => (
          <>
            {data.map((s) =>
              s.data.length > 0 ? (
                <LineSeries
                  key={s.id}
                  data={s.data}
                  xScale={xScale}
                  yScale={yScale}
                  color={s.color}
                  seriesId={s.id}
                  seriesName={s.name}
                  formatValue={(v) => v.toFixed(1)}
                />
              ) : null,
            )}
          </>
        )}
      </ChartPlot>
    </>
  );
}

export function IndexedLinesChart({ title, caption, series }: IndexedLinesChartProps) {
  const rows = series[0]?.points ?? [];

  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted">
          <th className="py-2 pr-4">Date</th>
          {series.map((s) => (
            <th key={s.id} className="py-2 pr-4">
              {s.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular">
        {[...rows]
          .reverse()
          .slice(0, 30)
          .map((row) => (
            <tr key={row.date} className="border-b border-border">
              <td className="py-2 pr-4">{row.date}</td>
              {series.map((s) => {
                const hit = s.points.find((p) => p.date === row.date);
                return (
                  <td key={s.id} className="py-2 pr-4">
                    {hit ? hit.index.toFixed(1) : "–"}
                  </td>
                );
              })}
            </tr>
          ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard title={title} caption={caption} table={table}>
      <IndexedLinesPlot series={series} />
    </ChartCard>
  );
}
