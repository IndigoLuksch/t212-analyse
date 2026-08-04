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
  useChartSize,
} from "@/components/charts";
import {
  createLinearScale,
  createTimeScale,
  niceLinearDomain,
  timeExtent,
} from "@/components/charts/scales";
import { formatAxisGbp, formatAxisPct } from "@/components/charts/Axes";
import { formatTooltipGbp, toIsoDate } from "@/components/charts/format";
import { MetricTip } from "@/components/ui/MetricTip";
import { StatChip } from "@/components/ui/StatChip";
import { StatTile } from "@/components/ui/StatTile";
import type { RangeState } from "@/components/charts";

const FIXTURE_WIDTHS = [360, 480, 720, 1100] as const;
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

function LineAreaFixture() {
  const { width, height } = useChartSize();
  const dates = allDates;
  const margins = DEFAULT_MARGINS;
  const plotW = width - margins.left - margins.right;
  const plotH = height - margins.top - margins.bottom;

  const xScale = useMemo(
    () => createTimeScale(timeExtent(dates), [0, plotW]),
    [dates, plotW],
  );
  const yScale = useMemo(() => {
    const vals = [...lineSeriesA, ...lineSeriesB].map((d) => d.value);
    return createLinearScale(niceLinearDomain(vals), [plotH, 0]);
  }, [plotH]);

  return (
    <>
      <Legend
        items={[
          { id: "value", name: "Portfolio value", color: "var(--slot-1)" },
          { id: "invested", name: "Net cash in", color: "var(--ink-secondary)", mark: "line" },
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
              data={lineSeriesA}
              xScale={xScale}
              yScale={yScale}
              seriesId="value"
              seriesName="Portfolio value"
              formatValue={formatTooltipGbp}
            />
            <LineSeries
              data={lineSeriesB}
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
    </>
  );
}

function SyncedPanelsFixture() {
  const { width } = useChartSize();
  const dates = allDates;
  const plotW = width - COMPACT_MARGINS.left - COMPACT_MARGINS.right;
  const xScale = useMemo(
    () => createTimeScale(timeExtent(dates), [0, plotW]),
    [dates, plotW],
  );
  const yScaleShares = useMemo(() => createLinearScale([0, 80], [64, 0]), []);
  const flowMax = useMemo(
    () => Math.max(...monthlyFlows.map((d) => Math.abs(d.value)), 1),
    [],
  );
  const yScaleFlow = useMemo(
    () => createLinearScale([-flowMax * 1.1, flowMax * 1.1], [72, 0]),
    [flowMax],
  );

  return (
    <>
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
        width={width}
        dates={dates}
        xScale={xScale}
        margins={COMPACT_MARGINS}
        bottomAxis={<XAxis scale={xScale} width={plotW} />}
        panels={[
          {
            id: "price",
            height: 180,
            render: ({ plotWidth, xScale: xs }) => {
              const ys = createLinearScale(
                niceLinearDomain(lineSeriesA.map((d) => d.value)),
                [180, 0],
              );
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
                <StepArea
                  data={stepShares}
                  xScale={xs}
                  yScale={yScaleShares}
                  seriesName="Shares held"
                />
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
    </>
  );
}

function StackedAreaFixture({ mode }: { mode: "percent" | "absolute" }) {
  const { width, height } = useChartSize();
  const margins = DEFAULT_MARGINS;
  const plotW = width - margins.left - margins.right;
  const plotH = height - margins.top - margins.bottom;
  const dates = stackedSeries[0]!.data.map((d) => d.date);
  const xScale = useMemo(
    () => createTimeScale(timeExtent(dates), [0, plotW]),
    [dates, plotW],
  );
  const yScale = useMemo(
    () => createLinearScale(mode === "percent" ? [0, 1] : [0, 1.2], [plotH, 0]),
    [mode, plotH],
  );

  return (
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
          series={stackedSeries}
          dates={dates}
          xScale={xScale}
          yScale={yScale}
          mode={mode}
          onBandClick={(id) => console.log("band click", id)}
        />
      )}
    </ChartPlot>
  );
}

function ScatterFixture() {
  const { width, height } = useChartSize();
  const margins = DEFAULT_MARGINS;
  const plotW = width - margins.left - margins.right;
  const plotH = height - margins.top - margins.bottom;
  const scatterX = useMemo(() => createLinearScale([0, 5], [0, plotW]), [plotW]);
  const scatterY = useMemo(() => createLinearScale([-0.2, 0.5], [plotH, 0]), [plotH]);

  return (
    <svg width={width} height={height}>
      <g transform={`translate(${margins.left},${margins.top})`}>
        <YAxis scale={scatterY} height={plotH} format={formatAxisPct} width={plotW} />
        <g transform={`translate(0,${plotH})`}>
          <XAxisLinear scale={scatterX} width={plotW} format={(n) => `${n.toFixed(1)}y`} />
        </g>
        <ScatterPlot
          points={scatterPoints}
          xScale={scatterX}
          yScale={scatterY}
          width={plotW}
          height={plotH}
          references={[
            { value: 0.1, label: "All-World XIRR", color: "var(--baseline)" },
            { value: 0.14, label: "S&P 500 XIRR", color: "var(--slot-4)" },
          ]}
        />
      </g>
    </svg>
  );
}

function DivergingFixture() {
  const { width } = useChartSize();
  return <DivergingBars data={divergingBars} width={width} />;
}

function StripFixture() {
  const { width } = useChartSize();
  const stripX = useMemo(() => createLinearScale([-15, 15], [40, width - 40]), [width]);
  return <StripPlot points={stripPoints} xScale={stripX} width={width} />;
}

function DecompositionFixture() {
  const { width } = useChartSize();
  return <DecompositionBar segments={decompositionSegments} width={Math.max(width - 40, 80)} />;
}

export default function ChartsDevPage() {
  const [fixtureWidth, setFixtureWidth] = useState<(typeof FIXTURE_WIDTHS)[number]>(720);
  const [range, setRange] = useState<RangeState>({
    start: FIXTURE_MIN,
    end: FIXTURE_MAX,
    preset: "Max",
  });
  const [brushValue, setBrushValue] = useState<[Date, Date]>([allDates[30]!, allDates[90]!]);
  const [stackMode, setStackMode] = useState<"percent" | "absolute">("percent");

  return (
    <main className="mx-auto max-w-[1200px] space-y-10 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-medium text-ink">Chart primitives</h1>
        <p className="text-sm text-muted">
          Storybook-style fixtures for Phase 4. Light/dark follows system preference.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <div className="flex items-center gap-1 text-sm">
            {FIXTURE_WIDTHS.map((w, i) => (
              <span key={w} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted">·</span>}
                <button
                  type="button"
                  onClick={() => setFixtureWidth(w)}
                  className={fixtureWidth === w ? "text-ink" : "text-muted"}
                >
                  {w}
                </button>
              </span>
            ))}
          </div>
          <span className="text-sm text-muted">
            resize me — fixtures re-render at the chosen width
          </span>
        </div>
      </header>

      <div style={{ width: fixtureWidth, maxWidth: "100%" }} className="space-y-10">
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
            width={fixtureWidth}
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
              width={fixtureWidth}
              domain={[allDates[0]!, allDates.at(-1)!]}
              value={brushValue}
              onChange={setBrushValue}
              context={lineSeriesB}
            />
          </div>
        </section>

        <ChartCard title="Line + area series" caption="Value vs invested" table={<ChartTable />}>
          <LineAreaFixture />
        </ChartCard>

        <ChartCard title="Synced panels" caption="Price · shares · monthly flow">
          <SyncedPanelsFixture />
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
          <StackedAreaFixture mode={stackMode} />
        </ChartCard>

        <ChartCard title="Scatter plot" caption="Hold time × annual return">
          <Legend
            items={[
              { id: "open", name: "Open", color: "var(--slot-1)", mark: "dot" },
              { id: "closed", name: "Closed", color: "var(--muted)", mark: "dot" },
            ]}
            className="mb-3"
          />
          <ScatterFixture />
        </ChartCard>

        <ChartCard title="Diverging bars" caption="Profit by stock">
          <DivergingFixture />
        </ChartCard>

        <ChartCard title="Strip plot" caption="Sell timing (index-adj. 6m post-exit)">
          <StripFixture />
        </ChartCard>

        <ChartCard title="Decomposition bar" caption="Price + dividends + FX">
          <DecompositionFixture />
        </ChartCard>

        <ChartCard title="Stale state" caption="Reduced opacity while refetching" stale>
          <div className="flex h-32 items-center justify-center text-muted">
            Previous render held at 60% opacity
          </div>
        </ChartCard>
      </div>
    </main>
  );
}
