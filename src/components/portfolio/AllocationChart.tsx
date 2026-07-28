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
} from "@/components/charts";
import type { StackedSeries } from "@/components/charts/StackedArea";
import { formatAxisGbp, formatAxisPct } from "@/components/charts/Axes";
import { slotVar } from "@/lib/format/colors";
import { toDatePoints, useChartWidth } from "./chartUtils";

interface AllocationChartProps {
  allocation: { date: string; weights: Record<string, number> }[];
  valueSeries: { date: string; value: number }[];
  tickerMeta: Record<string, { name: string; colorSlot: number | null }>;
}

const H = 280;

export function AllocationChart({ allocation, valueSeries, tickerMeta }: AllocationChartProps) {
  const { ref, width } = useChartWidth();
  const router = useRouter();
  const [mode, setMode] = useState<"percent" | "absolute">("percent");

  const valueByDate = useMemo(
    () => new Map(valueSeries.map((d) => [d.date, d.value])),
    [valueSeries],
  );

  const tickers = useMemo(() => {
    const set = new Set<string>();
    for (const day of allocation) {
      for (const t of Object.keys(day.weights)) set.add(t);
    }
    return [...set].sort((a, b) => {
      const wa = allocation.at(-1)?.weights[a] ?? 0;
      const wb = allocation.at(-1)?.weights[b] ?? 0;
      return wb - wa;
    });
  }, [allocation]);

  const dates = useMemo(
    () => allocation.map((d) => toDatePoints([{ date: d.date, value: 0 }])[0]!.date),
    [allocation],
  );

  const series: StackedSeries[] = useMemo(() => {
    return tickers.map((ticker) => {
      const meta = tickerMeta[ticker];
      return {
        id: ticker,
        name: meta?.name ?? ticker,
        slot: meta?.colorSlot ?? undefined,
        color: slotVar(meta?.colorSlot),
        data: allocation.map((day) => {
          const w = day.weights[ticker] ?? 0;
          const total = valueByDate.get(day.date) ?? 0;
          const value = mode === "percent" ? w : w * total;
          return { date: toDatePoints([{ date: day.date, value: 0 }])[0]!.date, value };
        }),
      };
    });
  }, [tickers, tickerMeta, allocation, valueByDate, mode]);

  const margins = DEFAULT_MARGINS;
  const plotW = width - margins.left - margins.right;

  const xScale = useMemo(
    () => createTimeScale(timeExtent(dates), [0, plotW]),
    [dates, plotW],
  );

  const yScale = useMemo(
    () =>
      createLinearScale(mode === "percent" ? [0, 1] : [0, Math.max(...valueSeries.map((d) => d.value), 1)], [
        H - margins.top - margins.bottom,
        0,
      ]),
    [mode, valueSeries, margins.top, margins.bottom],
  );

  const legendItems = series.slice(0, 8).map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color ?? "var(--muted)",
    mark: "area" as const,
  }));
  if (series.length > 8) {
    legendItems.push({ id: "other", name: "Other", color: "var(--muted)", mark: "area" });
  }

  return (
    <div ref={ref}>
      <ChartCard
        title="Allocation over time"
        caption="Daily portfolio weights"
        captionMetric="allocationWeight"
      >
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
          height={H}
          dates={dates}
          xScale={xScale}
          margins={margins}
          leftAxis={
            <YAxis
              scale={yScale}
              height={H - margins.top - margins.bottom}
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
      </ChartCard>
    </div>
  );
}
