"use client";

import { TABULAR_CLASS, formatAxisDate, formatAxisGbp, formatAxisNumber, formatAxisPct } from "./format";
import { linearTicks, timeTicks } from "./scales";
import type { ScaleLinear, ScaleTime } from "d3-scale";

interface GridLinesProps {
  orientation: "horizontal" | "vertical";
  scale: ScaleLinear<number, number> | ScaleTime<number, number>;
  length: number;
  tickCount?: number;
}

export function GridLines({ orientation, scale, length, tickCount = 5 }: GridLinesProps) {
  const ticks =
    orientation === "horizontal"
      ? linearTicks(scale as ScaleLinear<number, number>, tickCount)
      : timeTicks(scale as ScaleTime<number, number>, tickCount);

  return (
    <g className="gridlines">
      {ticks.map((tick, i) => {
        const pos = (scale as ScaleLinear<number, number>)(tick as number);
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
}

export function YAxis({
  scale,
  height,
  format = formatAxisNumber,
  tickCount = 5,
  showGrid = true,
  width = 0,
}: YAxisProps) {
  const ticks = linearTicks(scale, tickCount);

  return (
    <g>
      {showGrid && width > 0 && (
        <GridLines orientation="horizontal" scale={scale} length={width} tickCount={tickCount} />
      )}
      <line x1={0} x2={0} y1={0} y2={height} stroke="var(--baseline)" strokeWidth={1} />
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
  format = formatAxisDate,
  tickCount = 6,
  showGrid = false,
  height = 0,
}: XAxisProps) {
  const ticks = timeTicks(scale, tickCount);

  return (
    <g transform={`translate(0,${height})`}>
      {showGrid && height > 0 && (
        <GridLines orientation="vertical" scale={scale} length={height} tickCount={tickCount} />
      )}
      <line x1={0} x2={width} y1={0} y2={0} stroke="var(--baseline)" strokeWidth={1} />
      {ticks.map((tick, i) => {
        const x = scale(tick);
        return (
          <g key={i} transform={`translate(${x},0)`}>
            <text
              x={0}
              y={16}
              textAnchor="middle"
              fill="var(--muted)"
              fontSize={11}
              className={TABULAR_CLASS}
            >
              {format(tick)}
            </text>
          </g>
        );
      })}
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
  tickCount = 6,
}: XAxisLinearProps) {
  const ticks = linearTicks(scale, tickCount);

  return (
    <g>
      <line x1={0} x2={width} y1={0} y2={0} stroke="var(--baseline)" strokeWidth={1} />
      {ticks.map((tick, i) => {
        const x = scale(tick);
        return (
          <g key={i} transform={`translate(${x},0)`}>
            <text
              x={0}
              y={16}
              textAnchor="middle"
              fill="var(--muted)"
              fontSize={11}
              className={TABULAR_CLASS}
            >
              {format(tick)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export { formatAxisGbp, formatAxisPct };
