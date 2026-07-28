"use client";

import { useCallback, useMemo } from "react";
import {
  CHART_MARKS,
  COMPACT_MARGINS,
  ColumnSeries,
  LineSeries,
  StepArea,
  SyncedPanels,
  TimeRangeControl,
  TooltipLayer,
  TradeMarkers,
  XAxis,
  YAxis,
  createLinearScale,
  createTimeScale,
  niceLinearDomain,
  timeExtent,
  type RangePreset,
} from "@/components/charts";
import type { TradeMarker } from "@/components/charts/TradeMarkers";
import { formatAxisNumber } from "@/components/charts/format";
import {
  clipToRange,
  parseDate,
  toDatePoints,
  toIsoDate,
  useChartWidth,
  useDateRange,
} from "@/components/portfolio/chartUtils";
import { formatDate, formatGbp, formatPct, formatShares } from "@/lib/format/numbers";

interface StockChartProps {
  prices: { date: string; closeLocal: number }[];
  avgCostSeries: { date: string; value: number }[];
  holdingsDaily: { date: string; shares: number }[];
  monthlyFlow: { month: string; value: number }[];
  orders: {
    id: string;
    side: "BUY" | "SELL";
    executedAt: string;
    quantity: number;
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
const DAY_MS = 86_400_000;

function shiftDays(iso: string, days: number): string {
  return toIsoDate(new Date(parseDate(iso).getTime() + days * DAY_MS));
}

/** Stub until W6.1 returns `heldRange` from computeStock(); same formula, computed from the orders. */
function heldWindow(
  orders: { executedAt: string }[],
  finalExitDate: string | null,
  minDate: string,
  maxDate: string,
): { start: string; end: string } {
  if (!minDate || !maxDate) return { start: minDate, end: maxDate };
  const firstFill = orders.map((o) => o.executedAt.slice(0, 10)).sort()[0] ?? minDate;
  const lastDate = finalExitDate ?? maxDate;
  const spanDays = Math.max(
    (parseDate(lastDate).getTime() - parseDate(firstFill).getTime()) / DAY_MS,
    0,
  );
  const pad = Math.min(Math.max(Math.round(spanDays * 0.15), 30), 365);
  const start = shiftDays(firstFill, -pad);
  const end = shiftDays(lastDate, pad);
  return {
    start: start < minDate ? minDate : start,
    end: end > maxDate ? maxDate : end,
  };
}

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

  const minDate = prices[0]?.date ?? "";
  const maxDate = prices.at(-1)?.date ?? "";

  const held = useMemo(
    () => heldWindow(orders, finalExitDate, minDate, maxDate),
    [orders, finalExitDate, minDate, maxDate],
  );
  const [range, setRange] = useDateRange({
    min: minDate,
    max: maxDate,
    initial: { ...held, preset: "Held" },
  });
  const resolvePreset = useCallback(
    (preset: RangePreset) => (preset === "Held" ? held : null),
    [held],
  );

  const closeContext = useMemo(
    () => toDatePoints(prices.map((p) => ({ date: p.date, value: p.closeLocal }))),
    [prices],
  );

  const filteredPrices = useMemo(() => clipToRange(prices, range), [prices, range]);
  const filteredAvg = useMemo(() => clipToRange(avgCostSeries, range), [avgCostSeries, range]);
  const filteredHoldings = useMemo(
    () => clipToRange(holdingsDaily, range),
    [holdingsDaily, range],
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

  const flowData = useMemo(
    () =>
      monthlyFlow
        .filter((m) => m.month >= range.start.slice(0, 7) && m.month <= range.end.slice(0, 7))
        .map((m) => ({
          date: parseDate(`${m.month}-15`),
          value: m.value,
        })),
    [monthlyFlow, range],
  );

  const tradeMarkers: TradeMarker[] = useMemo(
    () =>
      orders.map((o) => {
        const isBuy = o.side === "BUY";
        const gbp = isBuy ? o.totalGbp + o.feesGbp : o.totalGbp - o.feesGbp;
        const color = isBuy ? "var(--polarity-pos)" : "var(--polarity-neg)";
        return {
          id: o.id,
          date: parseDate(o.executedAt.slice(0, 10)),
          price: o.fillPriceLocal,
          value: gbp,
          side: isBuy ? ("buy" as const) : ("sell" as const),
          tooltip: {
            title: formatDate(o.executedAt),
            rows: [
              {
                label: isBuy ? "Bought" : "Sold",
                value: `${formatShares(o.quantity)} @ ${formatAxisNumber(o.fillPriceLocal)}`,
                color,
              },
              {
                label: isBuy ? "Cost incl. fees" : "Proceeds net of fees",
                value: formatGbp(gbp),
              },
            ],
          },
        };
      }),
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
    <TooltipLayer>
      <div ref={ref} className="space-y-3">
        <TimeRangeControl
          width={width}
          min={minDate}
          max={maxDate}
          value={range}
          onChange={setRange}
          presets={["Held", "1Y", "3Y", "5Y", "Max"]}
          resolvePreset={resolvePreset}
          context={closeContext}
        />
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
                />
              ),
            },
          ]}
        />
      </div>
    </TooltipLayer>
  );
}
