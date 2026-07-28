"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChartCard,
  ChartPlot,
  DEFAULT_MARGINS,
  Legend,
  StackedArea,
  XAxis,
  YAxis,
  createLinearScale,
  createTimeScale,
  timeExtent,
  useChartSize,
} from "@/components/charts";
import type { StackedSeries } from "@/components/charts/StackedArea";
import { formatAxisGbp, formatAxisPct } from "@/components/charts/Axes";
import { parseIsoDate } from "@/components/charts/format";
import { slotVar } from "@/lib/format/colors";

interface AllocationChartProps {
  allocation: { date: string; weights: Record<string, number> }[];
  valueSeries: { date: string; value: number }[];
  tickerMeta: Record<string, { name: string; colorSlot: number | null }>;
}

function AllocationPlot({
  allocation,
  valueSeries,
  tickerMeta,
}: AllocationChartProps) {
  const { width, height } = useChartSize();
  const router = useRouter();
  const [mode, setMode] = useState<"percent" | "absolute">("percent");

  const valueByDate = useMemo(
    () => new Map(valueSeries.map((d) => [d.date, d.value])),
    [valueSeries],
  );

  const dates = useMemo(
    () => allocation.map((d) => parseIsoDate(d.date)),
    [allocation],
  );

  // Coloured bands by colour slot (1→8), everything else → Other. Slot order is
  // stable — do not re-sort by weight per day.
  const series: StackedSeries[] = useMemo(() => {
    const allTickers = new Set<string>();
    for (const day of allocation) {
      for (const t of Object.keys(day.weights)) allTickers.add(t);
    }

    const slotted: { ticker: string; slot: number }[] = [];
    const rest: string[] = [];
    for (const ticker of allTickers) {
      const slot = tickerMeta[ticker]?.colorSlot;
      if (slot != null && slot >= 1 && slot <= 8) {
        slotted.push({ ticker, slot });
      } else {
        rest.push(ticker);
      }
    }
    slotted.sort((a, b) => a.slot - b.slot);

    const makeSeries = (ticker: string): StackedSeries => {
      const meta = tickerMeta[ticker];
      return {
        id: ticker,
        name: meta?.name ?? ticker,
        slot: meta?.colorSlot ?? undefined,
        color: slotVar(meta?.colorSlot),
        data: allocation.map((day, di) => {
          const w = day.weights[ticker] ?? 0;
          const total = valueByDate.get(day.date) ?? 0;
          const value = mode === "percent" ? w : w * total;
          return { date: dates[di]!, value };
        }),
      };
    };

    return [...slotted.map((s) => makeSeries(s.ticker)), ...rest.map(makeSeries)];
  }, [allocation, tickerMeta, valueByDate, mode, dates]);

  const margins = DEFAULT_MARGINS;
  const plotW = width - margins.left - margins.right;
  const plotH = height - margins.top - margins.bottom;

  const xScale = useMemo(
    () => createTimeScale(timeExtent(dates), [0, plotW]),
    [dates, plotW],
  );

  const yScale = useMemo(
    () =>
      createLinearScale(mode === "percent" ? [0, 1] : [0, Math.max(...valueSeries.map((d) => d.value), 1)], [
        plotH,
        0,
      ]),
    [mode, valueSeries, plotH],
  );

  const slottedSeries = series.filter((s) => s.slot != null && s.slot >= 1 && s.slot <= 8);
  const legendItems = slottedSeries.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color ?? "var(--muted)",
    mark: "area" as const,
  }));
  if (series.length > slottedSeries.length) {
    legendItems.push({ id: "other", name: "Other", color: "var(--muted)", mark: "area" });
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-4">
        <Legend items={legendItems} />
        <div className="flex shrink-0 gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode("percent")}
            className={mode === "percent" ? "text-ink" : "text-muted"}
          >
            %
          </button>
          <span className="text-muted">/</span>
          <button
            type="button"
            onClick={() => setMode("absolute")}
            className={mode === "absolute" ? "text-ink" : "text-muted"}
          >
            £
          </button>
        </div>
      </div>
      <ChartPlot
        width={width}
        height={height}
        dates={dates}
        xScale={xScale}
        margins={margins}
        crosshairTooltip={false}
        leftAxis={
          <YAxis
            scale={yScale}
            height={plotH}
            format={mode === "percent" ? formatAxisPct : formatAxisGbp}
            width={plotW}
          />
        }
        bottomAxis={<XAxis scale={xScale} width={plotW} />}
      >
        {() => (
          <StackedArea
            series={series}
            dates={dates}
            xScale={xScale}
            yScale={yScale}
            mode={mode}
            onBandClick={(id) => router.push(`/stocks/${encodeURIComponent(id)}`)}
          />
        )}
      </ChartPlot>
    </>
  );
}

export function AllocationChart(props: AllocationChartProps) {
  return (
    <ChartCard
      title="Allocation over time"
      caption="Daily portfolio weights"
      captionMetric="allocationWeight"
    >
      <AllocationPlot {...props} />
    </ChartCard>
  );
}
