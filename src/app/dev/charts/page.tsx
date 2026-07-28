"use client";

import { useMemo, useState } from "react";
import {
  AreaSeries,
  ChartCard,
  ChartPlot,
  ColumnSeries,
  COMPACT_MARGINS,
  DEFAULT_MARGINS,
  DecompositionBar,
  DivergingBars,
  FIXTURE_WIDTH,
  Legend,
  LineSeries,
  ScatterPlot,
  RangeBrush,
  StackedArea,
  StepArea,
  StripPlot,
  SyncedPanels,
  TimeRangeControl,
  TradeMarkers,
  XAxis,
  XAxisLinear,
  YAxis,
  allDates,
  chartTableRows,
  decompositionSegments,
  divergingBars,
  lineSeriesA,
  lineSeriesB,
  monthlyFlows,
  scatterPoints,
  stackedSeries,
  stepShares,
  stripPoints,
  tradeMarkers,
} from "@/components/charts";
import {
  createLinearScale,
  createTimeScale,
  niceLinearDomain,
  timeExtent,
} from "@/components/charts/scales";
import { formatAxisGbp, formatAxisPct } from "@/components/charts/Axes";
import { formatTooltipGbp } from "@/components/charts/format";
import { MetricTip } from "@/components/ui/MetricTip";
import { StatChip } from "@/components/ui/StatChip";
import { StatTile } from "@/components/ui/StatTile";
import { toIsoDate } from "@/components/charts/format";
import type { RangeState } from "@/components/charts";

const W = FIXTURE_WIDTH;
const H = 280;
const FIXTURE_MIN = toIsoDate(allDates[0]!);
const FIXTURE_MAX = toIsoDate(allDates.at(-1)!);

function ChartTable() {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted">
          <th className="py-2 pr-4">Date</th>
          <th className="py-2 pr-4">Value</th>
          <th className="py-2">Invested</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {chartTableRows.map((row) => (
          <tr key={row.date} className="border-b border-border">
            <td className="py-2 pr-4">{row.date}</td>
            <td className="py-2 pr-4">{row.value}</td>
            <td className="py-2">{row.invested}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ChartsDevPage() {
  const [range, setRange] = useState<RangeState>({
    start: FIXTURE_MIN,
    end: FIXTURE_MAX,
    preset: "Max",
  });
  const [brushValue, setBrushValue] = useState<[Date, Date]>([allDates[30]!, allDates[90]!]);
  const [stackMode, setStackMode] = useState<"percent" | "absolute">("percent");

  const dates = allDates;
  const xDomain = timeExtent(dates);
  const margins = DEFAULT_MARGINS;

  const xScale = useMemo(
    () => createTimeScale(xDomain, [0, W - margins.left - margins.right]),
    [xDomain, margins.left, margins.right],
  );

  const yScaleValue = useMemo(() => {
    const vals = [...lineSeriesA, ...lineSeriesB].map((d) => d.value);
    return createLinearScale(niceLinearDomain(vals), [H - margins.top - margins.bottom, 0]);
  }, [margins.top, margins.bottom]);

  const yScaleShares = useMemo(
    () => createLinearScale([0, 80], [64, 0]),
    [],
  );

  const flowMax = useMemo(
    () => Math.max(...monthlyFlows.map((d) => Math.abs(d.value)), 1),
    [],
  );
  const yScaleFlow = useMemo(
    () => createLinearScale([-flowMax * 1.1, flowMax * 1.1], [72, 0]),
    [flowMax],
  );

  const yScaleStack = useMemo(
    () => createLinearScale(stackMode === "percent" ? [0, 1] : [0, 1.2], [H - margins.top - margins.bottom, 0]),
    [stackMode, margins.top, margins.bottom],
  );

  const scatterX = useMemo(
    () => createLinearScale([0, 5], [0, W - margins.left - margins.right]),
    [margins.left, margins.right],
  );
  const scatterY = useMemo(
    () => createLinearScale([-0.2, 0.5], [H - margins.top - margins.bottom, 0]),
    [margins.top, margins.bottom],
  );

  const stripX = useMemo(
    () => createLinearScale([-15, 15], [40, W - 40]),
    [],
  );

  return (
    <main className="mx-auto max-w-4xl space-y-10 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-medium text-ink">Chart primitives</h1>
        <p className="text-sm text-muted">
          Storybook-style fixtures for Phase 4. Light/dark follows system preference.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink-secondary">UI helpers</h2>
        <div className="flex flex-wrap items-center gap-4">
          <StatChip label="Value" value="£42,180" />
          <StatChip label="XIRR" value="+12.4%" metric="xirr" />
          <MetricTip metric="pickingEdge" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Current value" value="£42,180" sub="as of today" />
          <StatTile label="Invested" value="£35,000" />
          <StatTile
            label="Picking edge"
            value="+2.1%/yr"
            sub="vs All-World replay"
            metric="pickingEdge"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-ink-secondary">Time range</h2>
        <TimeRangeControl
          width={W}
          min={FIXTURE_MIN}
          max={FIXTURE_MAX}
          value={range}
          onChange={setRange}
          context={lineSeriesA}
        />
        <div className="space-y-1">
          <p className="text-sm text-muted">
            Standalone brush · {toIsoDate(brushValue[0])} – {toIsoDate(brushValue[1])}
          </p>
          <RangeBrush
            width={W}
            domain={[allDates[0]!, allDates.at(-1)!]}
            value={brushValue}
            onChange={setBrushValue}
            context={lineSeriesB}
          />
        </div>
      </section>

      <ChartCard title="Line + area series" caption="Value vs invested" table={<ChartTable />}>
        <Legend
          items={[
            { id: "value", name: "Portfolio value", color: "var(--slot-1)" },
            { id: "invested", name: "Net cash in", color: "var(--ink-secondary)", mark: "line" },
          ]}
          className="mb-3"
        />
        <ChartPlot
          width={W}
          height={H}
          dates={dates}
          xScale={xScale}
          margins={margins}
          leftAxis={<YAxis scale={yScaleValue} height={H - margins.top - margins.bottom} format={formatAxisGbp} width={W - margins.left - margins.right} />}
          bottomAxis={<XAxis scale={xScale} width={W - margins.left - margins.right} />}
        >
          {() => (
            <>
              <AreaSeries
                data={lineSeriesA}
                xScale={xScale}
                yScale={yScaleValue}
                seriesId="value"
                seriesName="Portfolio value"
                formatValue={formatTooltipGbp}
              />
              <LineSeries
                data={lineSeriesB}
                xScale={xScale}
                yScale={yScaleValue}
                color="var(--ink-secondary)"
                seriesId="invested"
                seriesName="Net cash in"
                formatValue={formatTooltipGbp}
              />
            </>
          )}
        </ChartPlot>
      </ChartCard>

      <ChartCard title="Synced panels" caption="Price · shares · monthly flow">
        <Legend
          items={[
            { id: "close", name: "Close", color: "var(--slot-1)", mark: "line" },
            { id: "avg", name: "Avg cost", color: "var(--ink-secondary)", mark: "line" },
            { id: "buy", name: "Buy", color: "var(--polarity-pos)", mark: "triangle-up" },
            { id: "sell", name: "Sell", color: "var(--polarity-neg)", mark: "triangle-down" },
            { id: "div", name: "Dividend", color: "var(--slot-3)", mark: "dot" },
          ]}
          className="mb-3"
        />
        <SyncedPanels
          width={W}
          dates={dates}
          xScale={xScale}
          margins={COMPACT_MARGINS}
          bottomAxis={<XAxis scale={xScale} width={W - COMPACT_MARGINS.left - COMPACT_MARGINS.right} />}
          panels={[
            {
              id: "price",
              height: 180,
              render: ({ plotWidth, xScale: xs }) => {
                const ys = createLinearScale(niceLinearDomain(lineSeriesA.map((d) => d.value)), [180, 0]);
                return (
                  <>
                    <YAxis scale={ys} height={180} width={plotWidth} tickCount={4} />
                    <LineSeries
                      data={lineSeriesA}
                      xScale={xs}
                      yScale={ys}
                      seriesId="price"
                      seriesName="Close"
                      formatValue={formatTooltipGbp}
                    />
                    <TradeMarkers
                      trades={tradeMarkers}
                      xScale={(d) => xs(d)}
                      yScale={(v) => ys(v)}
                    />
                  </>
                );
              },
            },
            {
              id: "shares",
              height: 64,
              render: ({ xScale: xs }) => (
                <>
                  <YAxis scale={yScaleShares} height={64} tickCount={2} />
                  <StepArea data={stepShares} xScale={xs} yScale={yScaleShares} seriesName="Shares held" />
                </>
              ),
            },
            {
              id: "flow",
              height: 72,
              render: ({ plotWidth, xScale: xs }) => (
                <>
                  <YAxis
                    scale={yScaleFlow}
                    height={72}
                    showGrid={false}
                    tickValues={[-flowMax, flowMax]}
                    format={formatAxisGbp}
                  />
                  <ColumnSeries
                    data={monthlyFlows}
                    xScale={xs}
                    yScale={yScaleFlow}
                    width={plotWidth}
                  />
                </>
              ),
            },
          ]}
        />
      </ChartCard>

      <ChartCard title="Stacked area" caption="Allocation over time">
        <div className="mb-3 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setStackMode("percent")}
            className={stackMode === "percent" ? "text-ink" : "text-muted"}
          >
            %
          </button>
          <span className="text-muted">/</span>
          <button
            type="button"
            onClick={() => setStackMode("absolute")}
            className={stackMode === "absolute" ? "text-ink" : "text-muted"}
          >
            £
          </button>
        </div>
        <Legend
          items={stackedSeries.map((s) => ({
            id: s.id,
            name: s.name,
            color: `var(--slot-${s.slot})`,
            mark: "area" as const,
          }))}
          className="mb-3"
        />
        <ChartPlot
          width={W}
          height={H}
          dates={stackedSeries[0]!.data.map((d) => d.date)}
          xScale={createTimeScale(
            timeExtent(stackedSeries[0]!.data.map((d) => d.date)),
            [0, W - margins.left - margins.right],
          )}
          margins={margins}
          crosshairTooltip={false}
          leftAxis={<YAxis scale={yScaleStack} height={H - margins.top - margins.bottom} format={stackMode === "percent" ? formatAxisPct : formatAxisGbp} width={W - margins.left - margins.right} />}
          bottomAxis={<XAxis scale={xScale} width={W - margins.left - margins.right} />}
        >
          {() => (
            <StackedArea
              series={stackedSeries}
              dates={stackedSeries[0]!.data.map((d) => d.date)}
              xScale={createTimeScale(
                timeExtent(stackedSeries[0]!.data.map((d) => d.date)),
                [0, W - margins.left - margins.right],
              )}
              yScale={yScaleStack}
              mode={stackMode}
              onBandClick={(id) => console.log("band click", id)}
            />
          )}
        </ChartPlot>
      </ChartCard>

      <ChartCard title="Scatter plot" caption="Hold time × annual return">
        <Legend
          items={[
            { id: "open", name: "Open", color: "var(--slot-1)", mark: "dot" },
            { id: "closed", name: "Closed", color: "var(--muted)", mark: "dot" },
          ]}
          className="mb-3"
        />
        <svg width={W} height={H}>
          <g transform={`translate(${margins.left},${margins.top})`}>
            <YAxis scale={scatterY} height={H - margins.top - margins.bottom} format={formatAxisPct} width={W - margins.left - margins.right} />
            <g transform={`translate(0,${H - margins.top - margins.bottom})`}>
              <XAxisLinear scale={scatterX} width={W - margins.left - margins.right} format={(n) => `${n.toFixed(1)}y`} />
            </g>
            <ScatterPlot
              points={scatterPoints}
              xScale={scatterX}
              yScale={scatterY}
              width={W - margins.left - margins.right}
              height={H - margins.top - margins.bottom}
              referenceY={0.1}
              referenceLabel="benchmark XIRR"
            />
          </g>
        </svg>
      </ChartCard>

      <ChartCard title="Diverging bars" caption="Profit by stock">
        <DivergingBars data={divergingBars} width={W} />
      </ChartCard>

      <ChartCard title="Strip plot" caption="Sell timing (index-adj. 6m post-exit)">
        <StripPlot points={stripPoints} xScale={stripX} width={W} />
      </ChartCard>

      <ChartCard title="Decomposition bar" caption="Price + dividends + FX">
        <DecompositionBar segments={decompositionSegments} width={W - 40} />
      </ChartCard>

      <ChartCard title="Stale state" caption="Reduced opacity while refetching" stale>
        <div className="flex h-32 items-center justify-center text-muted">Previous render held at 60% opacity</div>
      </ChartCard>
    </main>
  );
}
