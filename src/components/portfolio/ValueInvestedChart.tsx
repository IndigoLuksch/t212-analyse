"use client";

import { useMemo } from "react";
import {
  AreaSeries,
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
} from "@/components/charts";
import { formatAxisGbp } from "@/components/charts/Axes";
import { formatTooltipGbp } from "@/components/charts/format";
import { toDatePoints, useChartWidth } from "./chartUtils";

interface ValueInvestedChartProps {
  valueSeries: { date: string; value: number }[];
  investedSeries: { date: string; value: number }[];
}

const H = 280;

export function ValueInvestedChart({ valueSeries, investedSeries }: ValueInvestedChartProps) {
  const { ref, width } = useChartWidth();

  const valueData = useMemo(() => toDatePoints(valueSeries), [valueSeries]);
  const investedData = useMemo(() => toDatePoints(investedSeries), [investedSeries]);
  const dates = useMemo(
    () => valueData.map((d) => d.date),
    [valueData],
  );

  const margins = DEFAULT_MARGINS;
  const plotW = width - margins.left - margins.right;

  const xScale = useMemo(
    () => createTimeScale(timeExtent(dates), [0, plotW]),
    [dates, plotW],
  );

  const yScale = useMemo(() => {
    const vals = [...valueData, ...investedData].map((d) => d.value);
    return createLinearScale(niceLinearDomain(vals), [H - margins.top - margins.bottom, 0]);
  }, [valueData, investedData, margins.top, margins.bottom]);

  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted">
          <th className="py-2 pr-4">Date</th>
          <th className="py-2 pr-4">Value</th>
          <th className="py-2">Net cash in</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {[...valueSeries].reverse().slice(0, 30).map((row) => {
          const inv = investedSeries.find((d) => d.date === row.date);
          return (
            <tr key={row.date} className="border-b border-border">
              <td className="py-2 pr-4">{row.date}</td>
              <td className="py-2 pr-4">{formatTooltipGbp(row.value)}</td>
              <td className="py-2">{formatTooltipGbp(inv?.value ?? 0)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div ref={ref}>
      <ChartCard
        title="Value vs invested"
        caption="Net cash in vs portfolio value"
        captionMetric="netCashIn"
        table={table}
      >
        <Legend
          items={[
            { id: "value", name: "Portfolio value", color: "var(--slot-1)", mark: "area" },
            { id: "invested", name: "Net cash in", color: "var(--ink-secondary)", mark: "line" },
          ]}
          className="mb-3"
        />
        <ChartPlot
          width={width}
          height={H}
          dates={dates}
          xScale={xScale}
          margins={margins}
          leftAxis={
            <YAxis
              scale={yScale}
              height={H - margins.top - margins.bottom}
              format={formatAxisGbp}
              width={plotW}
            />
          }
          bottomAxis={<XAxis scale={xScale} width={plotW} />}
        >
          {() => (
            <>
              <AreaSeries
                data={valueData}
                xScale={xScale}
                yScale={yScale}
                seriesId="value"
                seriesName="Portfolio value"
                formatValue={formatTooltipGbp}
              />
              <LineSeries
                data={investedData}
                xScale={xScale}
                yScale={yScale}
                color="var(--ink-secondary)"
                seriesId="invested"
                seriesName="Net cash in"
                formatValue={formatTooltipGbp}
              />
            </>
          )}
        </ChartPlot>
      </ChartCard>
    </div>
  );
}
