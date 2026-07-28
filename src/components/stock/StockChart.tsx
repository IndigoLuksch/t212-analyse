"use client";

import { useMemo, useState } from "react";
import {
  CHART_MARKS,
  COMPACT_MARGINS,
  ColumnSeries,
  LineSeries,
  StepArea,
  SyncedPanels,
  TimeRangePresets,
  TradeMarkers,
  XAxis,
  YAxis,
  createLinearScale,
  createTimeScale,
  niceLinearDomain,
  timeExtent,
  type TimeRangeValue,
} from "@/components/charts";
import type { TradeMarker } from "@/components/charts/TradeMarkers";
import { formatAxisNumber } from "@/components/charts/format";
import { filterByRange, parseDate, toDatePoints, useChartWidth } from "@/components/portfolio/chartUtils";
import { formatGbp, formatPct } from "@/lib/format/numbers";

interface StockChartProps {
  prices: { date: string; closeLocal: number }[];
  avgCostSeries: { date: string; value: number }[];
  holdingsDaily: { date: string; shares: number }[];
  monthlyFlow: { month: string; value: number }[];
  orders: {
    id: string;
    side: "BUY" | "SELL";
    executedAt: string;
    fillPriceLocal: number;
    totalGbp: number;
    feesGbp: number;
  }[];
  finalExitDate: string | null;
  keptAnnotation: { gbp: number; pct: number } | null;
  chartCurrency: string;
}

const PRICE_H = 220;
const SHARES_H = 64;
const FLOW_H = 72;

export function StockChart({
  prices,
  avgCostSeries,
  holdingsDaily,
  monthlyFlow,
  orders,
  finalExitDate,
  keptAnnotation,
}: StockChartProps) {
  const { ref, width } = useChartWidth();
  const [range, setRange] = useState<TimeRangeValue>({ preset: "Max" });

  const minDate = prices[0]?.date ?? "";
  const maxDate = prices.at(-1)?.date ?? "";

  const filteredPrices = useMemo(
    () => filterByRange(prices, range, minDate, maxDate),
    [prices, range, minDate, maxDate],
  );
  const filteredAvg = useMemo(
    () => filterByRange(avgCostSeries, range, minDate, maxDate),
    [avgCostSeries, range, minDate, maxDate],
  );
  const filteredHoldings = useMemo(
    () => filterByRange(holdingsDaily, range, minDate, maxDate),
    [holdingsDaily, range, minDate, maxDate],
  );

  const dates = useMemo(
    () => filteredPrices.map((p) => parseDate(p.date)),
    [filteredPrices],
  );

  const priceData = useMemo(
    () => toDatePoints(filteredPrices.map((p) => ({ date: p.date, value: p.closeLocal }))),
    [filteredPrices],
  );

  const postMortemSplit = useMemo(() => {
    if (!finalExitDate) return { before: priceData, after: [] as typeof priceData };
    const exitMs = parseDate(finalExitDate).getTime();
    return {
      before: priceData.filter((d) => d.date.getTime() <= exitMs),
      after: priceData.filter((d) => d.date.getTime() >= exitMs),
    };
  }, [priceData, finalExitDate]);

  const avgData = useMemo(() => toDatePoints(filteredAvg), [filteredAvg]);
  const sharesData = useMemo(
    () => toDatePoints(filteredHoldings.map((d) => ({ date: d.date, value: d.shares }))),
    [filteredHoldings],
  );

  const flowData = useMemo(() => {
    const start = range.start ?? minDate;
    const end = range.end ?? maxDate;
    return monthlyFlow
      .filter((m) => {
        const d = `${m.month}-01`;
        if (start && d < start.slice(0, 7)) return false;
        if (end && d > end.slice(0, 7)) return false;
        return true;
      })
      .map((m) => ({
        date: parseDate(`${m.month}-15`),
        value: m.value,
      }));
  }, [monthlyFlow, range, minDate, maxDate]);

  const tradeMarkers: TradeMarker[] = useMemo(
    () =>
      orders.map((o) => ({
        id: o.id,
        date: parseDate(o.executedAt.slice(0, 10)),
        price: o.fillPriceLocal,
        value: o.side === "BUY" ? o.totalGbp + o.feesGbp : o.totalGbp - o.feesGbp,
        side: o.side === "BUY" ? "buy" : "sell",
      })),
    [orders],
  );

  const margins = COMPACT_MARGINS;
  const plotW = width - margins.left - margins.right;

  const xScale = useMemo(
    () => createTimeScale(timeExtent(dates.length ? dates : [new Date()]), [0, plotW]),
    [dates, plotW],
  );

  const yScaleShares = useMemo(() => {
    const max = Math.max(...sharesData.map((d) => d.value), 1);
    return createLinearScale([0, max * 1.1], [SHARES_H, 0]);
  }, [sharesData]);

  const yScaleFlow = useMemo(() => {
    const vals = flowData.map((d) => d.value);
    const max = Math.max(...vals.map(Math.abs), 1);
    return createLinearScale([-max * 1.1, max * 1.1], [FLOW_H, 0]);
  }, [flowData]);

  return (
    <div ref={ref} className="space-y-3">
      <TimeRangePresets value={range} onChange={setRange} minDate={minDate} maxDate={maxDate} />
      <SyncedPanels
        width={width}
        dates={dates}
        xScale={xScale}
        margins={margins}
        bottomAxis={<XAxis scale={xScale} width={plotW} />}
        panels={[
          {
            id: "price",
            height: PRICE_H,
            render: ({ plotWidth, xScale: xs }) => {
              const ys = createLinearScale(
                niceLinearDomain(priceData.map((d) => d.value)),
                [PRICE_H, 0],
              );
              return (
                <>
                  <YAxis scale={ys} height={PRICE_H} width={plotWidth} tickCount={4} format={formatAxisNumber} />
                  <LineSeries
                    data={postMortemSplit.before}
                    xScale={xs}
                    yScale={ys}
                    seriesId="price"
                    seriesName="Close"
                  />
                  {postMortemSplit.after.length > 0 && (
                    <LineSeries
                      data={postMortemSplit.after}
                      xScale={xs}
                      yScale={ys}
                      seriesId="price-post"
                      seriesName="Close (post-exit)"
                      opacity={CHART_MARKS.postMortemOpacity}
                    />
                  )}
                  <LineSeries
                    data={avgData}
                    xScale={xs}
                    yScale={ys}
                    color="var(--ink-secondary)"
                    seriesId="avg"
                    seriesName="Avg cost"
                  />
                  <TradeMarkers
                    trades={tradeMarkers}
                    xScale={(d) => xs(d)}
                    yScale={(v) => ys(v)}
                  />
                  {keptAnnotation && postMortemSplit.after.length > 0 && (
                    <text
                      x={plotWidth - 4}
                      y={12}
                      textAnchor="end"
                      fill="var(--muted)"
                      fontSize={11}
                    >
                      kept: {formatGbp(keptAnnotation.gbp, { signed: true })} (
                      {formatPct(keptAnnotation.pct, { signed: true })} vs sold)
                    </text>
                  )}
                </>
              );
            },
          },
          {
            id: "shares",
            height: SHARES_H,
            render: ({ xScale: xs }) => (
              <>
                <YAxis scale={yScaleShares} height={SHARES_H} tickCount={2} format={formatAxisNumber} />
                <StepArea data={sharesData} xScale={xs} yScale={yScaleShares} seriesName="Shares held" />
              </>
            ),
          },
          {
            id: "flow",
            height: FLOW_H,
            render: ({ plotWidth, xScale: xs }) => (
              <ColumnSeries
                data={flowData}
                xScale={xs}
                yScale={yScaleFlow}
                width={plotWidth}
                height={FLOW_H}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
