"use client";

import {
  TABULAR_CLASS,
  axisTimeTickBudget,
  budgetTicks,
  budgetYTicks,
  estimateLabelWidth,
  formatAxisGbp,
  formatAxisNumber,
  formatAxisPct,
  layoutAxisLabels,
  snapPx,
} from "./format";
import { linearTicks, timeTicks } from "./scales";
import type { ScaleLinear, ScaleTime } from "d3-scale";

interface GridLinesProps {
  orientation: "horizontal" | "vertical";
  scale: ScaleLinear<number, number> | ScaleTime<number, number>;
  length: number;
  tickCount?: number;
  /** Explicit ticks, so the grid lands on the same values the axis labels do. */
  tickValues?: (number | Date)[];
}

export function GridLines({
  orientation,
  scale,
  length,
  tickCount = 5,
  tickValues,
}: GridLinesProps) {
  const ticks =
    tickValues ??
    (orientation === "horizontal"
      ? linearTicks(scale as ScaleLinear<number, number>, tickCount)
      : timeTicks(scale as ScaleTime<number, number>, tickCount));

  return (
    <g className="gridlines">
      {ticks.map((tick, i) => {
        const pos = snapPx((scale as ScaleLinear<number, number>)(tick as number));
        if (orientation === "horizontal") {
          return (
            <line
              key={i}
              x1={0}
              x2={length}
              y1={pos}
              y2={pos}
              stroke="var(--gridline)"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          );
        }
        return (
          <line
            key={i}
            x1={pos}
            x2={pos}
            y1={0}
            y2={length}
            stroke="var(--gridline)"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
        );
      })}
    </g>
  );
}

interface YAxisProps {
  scale: ScaleLinear<number, number>;
  height: number;
  format?: (n: number) => string;
  tickCount?: number;
  showGrid?: boolean;
  width?: number;
  /** Exact ticks, when the meaningful values are known (e.g. ±max on a signed axis). */
  tickValues?: number[];
}

export function YAxis({
  scale,
  height,
  format = formatAxisNumber,
  tickCount,
  showGrid = true,
  width = 0,
  tickValues,
}: YAxisProps) {
  const count = tickCount ?? budgetYTicks(height);
  const ticks = tickValues ?? linearTicks(scale, count);

  return (
    <g>
      {showGrid && width > 0 && (
        <GridLines orientation="horizontal" scale={scale} length={width} tickCount={count} />
      )}
      <line
        x1={snapPx(0)}
        x2={snapPx(0)}
        y1={0}
        y2={height}
        stroke="var(--baseline)"
        strokeWidth={1}
        shapeRendering="crispEdges"
      />
      {ticks.map((tick, i) => {
        const y = scale(tick);
        return (
          <g key={i} transform={`translate(0,${y})`}>
            <text
              x={-8}
              y={0}
              dy="0.32em"
              textAnchor="end"
              fill="var(--muted)"
              fontSize={11}
              className={TABULAR_CLASS}
              style={{ textRendering: "geometricPrecision" }}
            >
              {format(tick)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

interface XAxisProps {
  scale: ScaleTime<number, number>;
  width: number;
  format?: (d: Date) => string;
  tickCount?: number;
  showGrid?: boolean;
  height?: number;
}

export function XAxis({
  scale,
  width,
  format,
  tickCount,
  showGrid = false,
  height = 0,
}: XAxisProps) {
  const budget = axisTimeTickBudget(width);
  const count = tickCount ?? budget.tickCount;
  const fmt = format ?? budget.format;
  const labels = layoutAxisLabels(
    timeTicks(scale, count),
    (t) => scale(t),
    (t) => estimateLabelWidth(fmt(t)),
    width,
  );

  return (
    <g transform={`translate(0,${height})`}>
      {showGrid && height > 0 && (
        <GridLines
          orientation="vertical"
          scale={scale}
          length={height}
          tickValues={labels.map((l) => l.tick)}
        />
      )}
      <line
        x1={0}
        x2={width}
        y1={snapPx(0)}
        y2={snapPx(0)}
        stroke="var(--baseline)"
        strokeWidth={1}
        shapeRendering="crispEdges"
      />
      {labels.map(({ tick, x, anchor }, i) => (
        <g key={i} transform={`translate(${x},0)`}>
          <text
            x={0}
            y={16}
            textAnchor={anchor}
            fill="var(--muted)"
            fontSize={11}
            className={TABULAR_CLASS}
            style={{ textRendering: "geometricPrecision" }}
          >
            {fmt(tick)}
          </text>
        </g>
      ))}
    </g>
  );
}

interface XAxisLinearProps {
  scale: ScaleLinear<number, number>;
  width: number;
  format?: (n: number) => string;
  tickCount?: number;
}

export function XAxisLinear({
  scale,
  width,
  format = formatAxisNumber,
  tickCount,
}: XAxisLinearProps) {
  const count = tickCount ?? budgetTicks(width, 40);
  const labels = layoutAxisLabels(
    linearTicks(scale, count),
    (t) => scale(t),
    (t) => estimateLabelWidth(format(t)),
    width,
  );

  return (
    <g>
      <line
        x1={0}
        x2={width}
        y1={snapPx(0)}
        y2={snapPx(0)}
        stroke="var(--baseline)"
        strokeWidth={1}
        shapeRendering="crispEdges"
      />
      {labels.map(({ tick, x, anchor }, i) => (
        <g key={i} transform={`translate(${x},0)`}>
          <text
            x={0}
            y={16}
            textAnchor={anchor}
            fill="var(--muted)"
            fontSize={11}
            className={TABULAR_CLASS}
            style={{ textRendering: "geometricPrecision" }}
          >
            {format(tick)}
          </text>
        </g>
      ))}
    </g>
  );
}

export { formatAxisGbp, formatAxisPct };
