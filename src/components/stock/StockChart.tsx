"use client";

import { useCallback, useMemo } from "react";
import {
  CHART_MARKS,
  ChartCard,
  COMPACT_MARGINS,
  ColumnSeries,
  Legend,
  LineSeries,
  StepArea,
  SyncedPanels,
  TimeRangeControl,
  TradeMarkers,
  XAxis,
  YAxis,
  createLinearScale,
  createTimeScale,
  niceLinearDomain,
  timeExtent,
  useChartSize,
  useTooltip,
  type LegendItem,
  type RangePreset,
  type TooltipPayload,
  type TooltipRow,
} from "@/components/charts";
import type { TradeMarker } from "@/components/charts/TradeMarkers";
import { formatAxisGbp, makeAxisPriceFormatter } from "@/components/charts/format";
import {
  clipToRange,
  parseDate,
  toDatePoints,
  useDateRange,
} from "@/components/portfolio/chartUtils";
import { formatDate, formatGbp, formatPct, formatShares } from "@/lib/format/numbers";
import type { ScaleTime } from "d3-scale";

interface StockOrder {
  id: string;
  side: "BUY" | "SELL";
  executedAt: string;
  quantity: number;
  fillPriceLocal: number;
  totalGbp: number;
  feesGbp: number;
}

interface StockExit {
  exit: { date: string; orderIds: string[] };
  post: { rawAnnualised: number | null; adjAnnualised: number | null };
  ghost: { deltaGbp: number; deltaPct: number };
}

interface StockTranche {
  trancheId: string;
  classification: "up" | "down";
  totalReturn: number;
}

interface StockChartProps {
  prices: { date: string; closeLocal: number }[];
  avgCostSeries: { date: string; value: number }[];
  holdingsDaily: { date: string; shares: number }[];
  monthlyFlow: { month: string; value: number }[];
  orders: StockOrder[];
  divEvents: { date: string; perShareLocal: number }[];
  tranches: StockTranche[];
  exits: StockExit[];
  notes: Record<string, string>;
  finalExitDate: string | null;
  keptAnnotation: { gbp: number; pct: number } | null;
  heldRange: { start: string; end: string };
  chartCurrency: string;
}

const PRICE_H = 220;
const SHARES_H = 64;
const FLOW_H = 72;
/** Wider than COMPACT_MARGINS: the flow axis carries `−£1.2k`-shaped labels. */
const MARGINS = { ...COMPACT_MARGINS, left: 44 };

export function StockChart(props: StockChartProps) {
  return (
    <ChartCard title="Price · shares · flow">
      <StockChartBody {...props} />
    </ChartCard>
  );
}

function StockChartBody({
  prices,
  avgCostSeries,
  holdingsDaily,
  monthlyFlow,
  orders,
  divEvents,
  tranches,
  exits,
  notes,
  finalExitDate,
  keptAnnotation,
  heldRange,
  chartCurrency,
}: StockChartProps) {
  const { width, height: ctxHeight } = useChartSize();

  const defaultPanels = PRICE_H + SHARES_H + FLOW_H;
  // TimeRangeControl + Legend + gaps sit above the panels; reserve them when expanding.
  const stockChrome = 112;
  const panelTotal = Math.max(
    defaultPanels,
    ctxHeight - MARGINS.top - MARGINS.bottom - stockChrome,
  );
  const panelScale = panelTotal / defaultPanels;
  const priceH = Math.round(PRICE_H * panelScale);
  const sharesH = Math.round(SHARES_H * panelScale);
  const flowH = Math.round(FLOW_H * panelScale);

  const minDate = prices[0]?.date ?? "";
  const maxDate = prices.at(-1)?.date ?? "";

  const [range, setRange] = useDateRange({
    min: minDate,
    max: maxDate,
    initial: { ...heldRange, preset: "Held" },
  });
  const resolvePreset = useCallback(
    (preset: RangePreset) => (preset === "Held" ? heldRange : null),
    [heldRange],
  );

  const formatPrice = useMemo(
    () => makeAxisPriceFormatter(chartCurrency),
    [chartCurrency],
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

  const dividendDots = useMemo(
    () =>
      divEvents
        .filter((d) => d.date >= range.start && d.date <= range.end)
        .map((d) => ({
          iso: d.date,
          date: parseDate(d.date),
          perShareLocal: d.perShareLocal,
        })),
    [divEvents, range],
  );

  const trancheById = useMemo(
    () => new Map(tranches.map((t) => [t.trancheId, t])),
    [tranches],
  );
  const exitByOrderId = useMemo(() => {
    const map = new Map<string, StockExit>();
    for (const row of exits) {
      for (const id of row.exit.orderIds) map.set(id, row);
    }
    return map;
  }, [exits]);

  const tradeMarkers: TradeMarker[] = useMemo(
    () =>
      orders.map((o) => {
        const isBuy = o.side === "BUY";
        const gbp = isBuy ? o.totalGbp + o.feesGbp : o.totalGbp - o.feesGbp;
        const color = isBuy ? "var(--polarity-pos)" : "var(--polarity-neg)";
        const rows: TooltipRow[] = [
          {
            label: isBuy ? "Bought" : "Sold",
            value: `${formatShares(o.quantity)} @ ${formatPrice(o.fillPriceLocal)}`,
            color,
          },
          {
            label: isBuy ? "Cost incl. fees" : "Proceeds net of fees",
            value: formatGbp(gbp),
          },
        ];

        if (isBuy) {
          const tranche = trancheById.get(o.id);
          if (tranche) {
            rows.push({
              label: `Return since this buy · averaging ${tranche.classification}`,
              value: formatPct(tranche.totalReturn, { signed: true }),
            });
          }
        } else {
          const exitRow = exitByOrderId.get(o.id);
          if (exitRow) {
            if (exitRow.post.rawAnnualised != null) {
              rows.push({
                label: "Raw annualised since sale",
                value: formatPct(exitRow.post.rawAnnualised, { signed: true }),
              });
            }
            if (exitRow.post.adjAnnualised != null) {
              rows.push({
                label: "Adj annualised since sale",
                value: formatPct(exitRow.post.adjAnnualised, { signed: true }),
              });
            }
            rows.push({
              label: "Kept vs sold",
              value: `${formatGbp(exitRow.ghost.deltaGbp, { signed: true })} (${formatPct(
                exitRow.ghost.deltaPct,
                { signed: true },
              )})`,
            });
          }
        }

        const tooltip: TooltipPayload = {
          title: formatDate(o.executedAt),
          rows,
          ...(notes[o.id] ? { footer: notes[o.id] } : {}),
        };

        return {
          id: o.id,
          date: parseDate(o.executedAt.slice(0, 10)),
          price: o.fillPriceLocal,
          value: gbp,
          side: isBuy ? ("buy" as const) : ("sell" as const),
          tooltip,
        };
      }),
    [orders, formatPrice, trancheById, exitByOrderId, notes],
  );

  const legendItems = useMemo(() => {
    const items: LegendItem[] = [
      { id: "close", name: "Close", color: "var(--slot-1)", mark: "line" },
      { id: "avg", name: "Avg cost", color: "var(--ink-secondary)", mark: "line" },
    ];
    if (orders.some((o) => o.side === "BUY")) {
      items.push({ id: "buy", name: "Buy", color: "var(--polarity-pos)", mark: "triangle-up" });
    }
    if (orders.some((o) => o.side === "SELL")) {
      items.push({ id: "sell", name: "Sell", color: "var(--polarity-neg)", mark: "triangle-down" });
    }
    if (dividendDots.length > 0) {
      items.push({ id: "div", name: "Dividend", color: "var(--slot-3)", mark: "dot" });
    }
    return items;
  }, [orders, dividendDots.length]);

  const plotW = width - MARGINS.left - MARGINS.right;

  const xScale = useMemo(
    () => createTimeScale(timeExtent(dates.length ? dates : [new Date()]), [0, plotW]),
    [dates, plotW],
  );

  const sharesMax = useMemo(
    () => Math.max(...sharesData.map((d) => d.value), 1),
    [sharesData],
  );
  const yScaleShares = useMemo(
    () => createLinearScale([0, sharesMax * 1.1], [sharesH, 0]),
    [sharesMax, sharesH],
  );

  const flowMax = useMemo(
    () => Math.max(...flowData.map((d) => Math.abs(d.value)), 1),
    [flowData],
  );
  const yScaleFlow = useMemo(
    () => createLinearScale([-flowMax * 1.1, flowMax * 1.1], [flowH, 0]),
    [flowMax, flowH],
  );

  return (
    <div className="space-y-3">
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
      <Legend items={legendItems} />
      <SyncedPanels
        width={width}
        dates={dates}
        xScale={xScale}
        margins={MARGINS}
        bottomAxis={<XAxis scale={xScale} width={plotW} />}
        panels={[
          {
            id: "price",
            height: priceH,
            render: ({ plotWidth, xScale: xs }) => {
              const ys = createLinearScale(
                niceLinearDomain(priceData.map((d) => d.value)),
                [priceH, 0],
              );
              return (
                <>
                  <YAxis
                    scale={ys}
                    height={priceH}
                    width={plotWidth}
                    tickCount={4}
                    format={formatPrice}
                  />
                  <UnitCaption>{`${chartCurrency} / share`}</UnitCaption>
                  <LineSeries
                    data={postMortemSplit.before}
                    xScale={xs}
                    yScale={ys}
                    seriesId="price"
                    seriesName="Close"
                    formatValue={formatPrice}
                  />
                  {postMortemSplit.after.length > 0 && (
                    <LineSeries
                      data={postMortemSplit.after}
                      xScale={xs}
                      yScale={ys}
                      seriesId="price-post"
                      seriesName="Close (post-exit)"
                      opacity={CHART_MARKS.postMortemOpacity}
                      formatValue={formatPrice}
                    />
                  )}
                  <LineSeries
                    data={avgData}
                    xScale={xs}
                    yScale={ys}
                    color="var(--ink-secondary)"
                    seriesId="avg"
                    seriesName="Avg cost"
                    formatValue={formatPrice}
                  />
                  <DividendDots
                    events={dividendDots}
                    xScale={xs}
                    y={priceH - 3}
                    formatPrice={formatPrice}
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
            height: sharesH,
            render: ({ xScale: xs }) => (
              <>
                <YAxis
                  scale={yScaleShares}
                  height={sharesH}
                  showGrid={false}
                  tickValues={[0, sharesMax]}
                  format={formatShares}
                />
                <UnitCaption>shares</UnitCaption>
                <StepArea
                  data={sharesData}
                  xScale={xs}
                  yScale={yScaleShares}
                  seriesName="Shares held"
                  formatValue={formatShares}
                />
              </>
            ),
          },
          {
            id: "flow",
            height: flowH,
            render: ({ plotWidth, xScale: xs }) => (
              <>
                <YAxis
                  scale={yScaleFlow}
                  height={flowH}
                  showGrid={false}
                  tickValues={[-flowMax, flowMax]}
                  format={formatAxisGbp}
                />
                <UnitCaption>£ net bought / sold per month</UnitCaption>
                <ColumnSeries
                  data={flowData}
                  xScale={xs}
                  yScale={yScaleFlow}
                  width={plotWidth}
                />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}

/** Panel unit, top-left of the plot area — cheaper to read than a rotated axis title. */
function UnitCaption({ children }: { children: string }) {
  return (
    <text x={2} y={10} fill="var(--muted)" fontSize={10}>
      {children}
    </text>
  );
}

interface DividendDotsProps {
  events: { iso: string; date: Date; perShareLocal: number }[];
  xScale: ScaleTime<number, number>;
  y: number;
  formatPrice: (n: number) => string;
}

function DividendDots({ events, xScale, y, formatPrice }: DividendDotsProps) {
  const tooltip = useTooltip();
  if (events.length === 0) return null;

  return (
    <g onMouseLeave={() => tooltip.hide()}>
      {events.map((d) => {
        const cx = xScale(d.date);
        const payload: TooltipPayload = {
          title: formatDate(d.iso),
          rows: [
            {
              label: "Dividend",
              value: `${formatPrice(d.perShareLocal)} / share`,
              color: "var(--slot-3)",
            },
          ],
        };
        return (
          <g key={d.iso}>
            <circle cx={cx} cy={y} r={2} fill="var(--slot-3)" />
            <circle
              cx={cx}
              cy={y}
              r={CHART_MARKS.hitTargetMin / 2}
              fill="transparent"
              tabIndex={0}
              onMouseEnter={(e) => tooltip.show(e.clientX, e.clientY, payload)}
              onMouseMove={(e) => {
                // The plot's crosshair handler sits on the <svg>; let the
                // specific dividend win over the generic date readout.
                e.stopPropagation();
                tooltip.show(e.clientX, e.clientY, payload);
              }}
              onFocus={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                tooltip.show(
                  rect.left + rect.width / 2,
                  rect.top + rect.height / 2,
                  payload,
                );
              }}
              onBlur={() => tooltip.hide()}
            />
          </g>
        );
      })}
    </g>
  );
}
