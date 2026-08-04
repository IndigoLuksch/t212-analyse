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
  useChartSize,
} from "@/components/charts";
import { formatAxisGbp } from "@/components/charts/Axes";
import { formatTooltipGbp } from "@/components/charts/format";
import { toDatePoints } from "@/components/portfolio/chartUtils";

interface PieValueChartProps {
  valueSeries: { date: string; value: number }[];
  investedSeries: { date: string; value: number }[];
}

function PieValuePlot({ valueSeries, investedSeries }: PieValueChartProps) {
  const { width, height } = useChartSize();

  const valueData = useMemo(() => toDatePoints(valueSeries), [valueSeries]);
  const investedData = useMemo(() => toDatePoints(investedSeries), [investedSeries]);
  const dates = useMemo(() => valueData.map((d) => d.date), [valueData]);

  const margins = DEFAULT_MARGINS;
  const plotW = width - margins.left - margins.right;
  const plotH = height - margins.top - margins.bottom;

  const xScale = useMemo(
    () => createTimeScale(timeExtent(dates.length ? dates : [new Date()]), [0, plotW]),
    [dates, plotW],
  );

  const yScale = useMemo(() => {
    const vals = [...valueData, ...investedData].map((d) => d.value);
    return createLinearScale(niceLinearDomain(vals.length ? vals : [0, 100]), [plotH, 0]);
  }, [valueData, investedData, plotH]);

  return (
    <>
      <Legend
        items={[
          { id: "value", name: "Pie value", color: "var(--slot-1)", mark: "area" },
          { id: "invested", name: "Net cash in", color: "var(--ink)", mark: "line" },
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
          <YAxis scale={yScale} height={plotH} format={formatAxisGbp} width={plotW} />
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
              seriesName="Pie value"
              formatValue={formatTooltipGbp}
            />
            <LineSeries
              data={investedData}
              xScale={xScale}
              yScale={yScale}
              color="var(--ink)"
              seriesId="invested"
              seriesName="Net cash in"
              formatValue={formatTooltipGbp}
            />
          </>
        )}
      </ChartPlot>
    </>
  );
}

export function PieValueChart({ valueSeries, investedSeries }: PieValueChartProps) {
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
        {[...valueSeries]
          .reverse()
          .slice(0, 30)
          .map((row) => {
            const inv = investedSeries.find((d) => d.date === row.date);
            return (
              <tr key={row.date} className="border-b border-border">
                <td className="py-2 pr-4">{row.date}</td>
                <td className="py-2 pr-4">{formatTooltipGbp(row.value)}</td>
                <td className="py-2">{inv ? formatTooltipGbp(inv.value) : "–"}</td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      title="Pie value vs contributions"
      caption="Reconstructed daily value against cumulative net cash in"
      table={table}
    >
      <PieValuePlot valueSeries={valueSeries} investedSeries={investedSeries} />
    </ChartCard>
  );
}
