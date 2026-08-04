"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChartCard,
  ChartPlot,
  DEFAULT_MARGINS,
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
import { formatTooltipGbp, formatTooltipPct, parseIsoDate } from "@/components/charts/format";

interface AllocationChartProps {
  allocation: { date: string; weights: Record<string, number> }[];
  valueSeries: { date: string; value: number }[];
  tickerMeta: Record<string, { name: string; colorSlot: number | null }>;
  /** Every ticker ever held, current holdings first and largest first. */
  order: string[];
}

/**
 * A colour per band, for far more bands than there are distinguishable hues.
 *
 * Sixty-odd holdings cannot each get an identifiable colour, so colour is not
 * asked to carry identity here — the hover tooltip and the ordered legend do
 * that. What colour must do is separate each band from the ones it touches, so
 * the eight validated hues step in order and only repeat a hue eight positions
 * later, by which point the two bands are far apart in the stack. Each repeat
 * takes a different tint so a hue is never reused at the same value.
 *
 * The index comes from the portfolio-wide order, not the band's position in the
 * filtered chart, so changing the time range never repaints a holding.
 */
function bandColor(index: number): string {
  const hue = `var(--slot-${(index % 8) + 1})`;
  const tier = Math.floor(index / 8);
  if (tier === 0) return hue;
  // Alternate lighter and darker so consecutive cycles stay apart, easing off
  // as tiers grow rather than running to pure white or black.
  const step = Math.ceil(tier / 2);
  const towards = tier % 2 === 1 ? "var(--surface)" : "var(--ink)";
  const strength = Math.max(30, 100 - step * 22);
  return `color-mix(in oklab, ${hue} ${strength}%, ${towards})`;
}

function AllocationPlot({
  allocation,
  valueSeries,
  tickerMeta,
  order,
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

  // One band per holding, in the portfolio-wide order — no "Other" bucket.
  const series: StackedSeries[] = useMemo(() => {
    const present = new Set<string>();
    for (const day of allocation) {
      for (const t of Object.keys(day.weights)) present.add(t);
    }
    // Keep the global order but drop anything absent from the visible window,
    // so a clipped range does not carry empty bands.
    const visible = order.filter((t) => present.has(t));

    return visible.map((ticker) => ({
      id: ticker,
      name: tickerMeta[ticker]?.name ?? ticker,
      // Colour indexes the global order, so it is identical whatever the range.
      color: bandColor(order.indexOf(ticker)),
      data: allocation.map((day, di) => {
        const w = day.weights[ticker] ?? 0;
        const total = valueByDate.get(day.date) ?? 0;
        return { date: dates[di]!, value: mode === "percent" ? w : w * total };
      }),
    }));
  }, [allocation, tickerMeta, valueByDate, mode, dates, order]);

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

  return (
    <>
      {/* No legend: at sixty-odd holdings it would be a wall of names taller
          than the chart, and colour cannot identify that many series anyway.
          Identity comes from hovering a band, and the table view lists every
          holding with its weight. */}
      <div className="mb-3 flex items-center justify-end gap-4">
        <div className="flex shrink-0 gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode("percent")}
            className={
              mode === "percent"
                ? "text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                : "text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            }
          >
            %
          </button>
          <span className="text-muted">/</span>
          <button
            type="button"
            onClick={() => setMode("absolute")}
            className={
              mode === "absolute"
                ? "text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                : "text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            }
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
            bandPerSeries
            onBandClick={(id) => router.push(`/stocks/${encodeURIComponent(id)}`)}
          />
        )}
      </ChartPlot>
    </>
  );
}

export function AllocationChart(props: AllocationChartProps) {
  const last = props.allocation[props.allocation.length - 1];
  const lastValue = last
    ? (props.valueSeries.find((d) => d.date === last.date)?.value ?? 0)
    : 0;
  const rows = last
    ? Object.entries(last.weights)
        .map(([ticker, weight]) => ({
          ticker,
          name: props.tickerMeta[ticker]?.name ?? ticker,
          weight,
          value: weight * lastValue,
        }))
        .sort((a, b) => b.weight - a.weight)
    : [];

  const table = (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted">
          <th className="py-2 pr-4">Stock</th>
          <th className="py-2 pr-4">Weight</th>
          <th className="py-2">Value</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {rows.map((row) => (
          <tr key={row.ticker} className="border-b border-border">
            <td className="py-2 pr-4">{row.name}</td>
            <td className="py-2 pr-4">{formatTooltipPct(row.weight)}</td>
            <td className="py-2">{formatTooltipGbp(row.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      title="Allocation over time"
      caption="Daily portfolio weights"
      captionMetric="allocationWeight"
      table={table}
    >
      <AllocationPlot {...props} />
    </ChartCard>
  );
}
