"use client";

import { area, line } from "d3-shape";
import { useCallback, useMemo, useRef, useState } from "react";
import { YAxis } from "./Axes";
import { CHART_MARKS, DEFAULT_MARGINS } from "./constants";
import { formatAxisPct, formatTooltipPct, snapPx, TABULAR_CLASS } from "./format";
import { clampLabelX, estimateTextWidth, findNearestXIndex } from "./layout";
import { createLinearScale, niceLinearDomain } from "./scales";
import { useTooltip } from "./TooltipLayer";
import type { ChartMargins } from "./types";

export interface LinearLinePoint {
  x: number;
  y: number;
  n?: number;
  label: string;
}

export interface LinearLineBand {
  x: number;
  lo: number;
  hi: number;
}

interface LinearLineChartProps {
  points: LinearLinePoint[];
  width: number;
  height: number;
  yFormat?: (n: number) => string;
  xFormat?: (n: number) => string;
  margins?: ChartMargins;
  band?: LinearLineBand[];
}

function yDomainWithZero(values: number[], padding = 0.05): [number, number] {
  if (values.length === 0) return [-1, 1];
  const lo = Math.min(...values, 0);
  const hi = Math.max(...values, 0);
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    return [lo - pad, hi + pad];
  }
  const span = hi - lo;
  return [lo - span * padding, hi + span * padding];
}

export function LinearLineChart({
  points,
  width,
  height,
  yFormat = formatAxisPct,
  xFormat,
  margins = DEFAULT_MARGINS,
  band,
}: LinearLineChartProps) {
  const tooltip = useTooltip();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const plotWidth = width - margins.left - margins.right;
  const plotHeight = height - margins.top - margins.bottom;

  const sortedPoints = useMemo(
    () => [...points].sort((a, b) => a.x - b.x),
    [points],
  );

  const xs = useMemo(() => sortedPoints.map((p) => p.x), [sortedPoints]);
  const ys = useMemo(
    () => [
      ...sortedPoints.map((p) => p.y).filter(Number.isFinite),
      ...(band ?? []).flatMap((b) => [b.lo, b.hi]).filter(Number.isFinite),
    ],
    [sortedPoints, band],
  );

  const xDomain = useMemo<[number, number]>(
    () => (xs.length === 0 ? [0, 1] : niceLinearDomain(xs)),
    [xs],
  );
  const yDomain = useMemo(() => yDomainWithZero(ys), [ys]);

  const xScale = useMemo(
    () => createLinearScale(xDomain, [0, plotWidth]),
    [xDomain, plotWidth],
  );
  const yScale = useMemo(
    () => createLinearScale(yDomain, [plotHeight, 0]),
    [yDomain, plotHeight],
  );

  const lineD = useMemo(() => {
    if (sortedPoints.length === 0) return "";
    const gen = line<LinearLinePoint>()
      .x((d) => xScale(d.x))
      .y((d) => yScale(d.y))
      .defined((d) => Number.isFinite(d.y));
    return gen(sortedPoints) ?? "";
  }, [sortedPoints, xScale, yScale]);

  const bandD = useMemo(() => {
    if (!band || band.length === 0) return "";
    const sorted = [...band].sort((a, b) => a.x - b.x);
    const gen = area<LinearLineBand>()
      .x((d) => xScale(d.x))
      .y0((d) => yScale(d.lo))
      .y1((d) => yScale(d.hi));
    return gen(sorted) ?? "";
  }, [band, xScale, yScale]);

  const zeroY = yScale(0);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || sortedPoints.length === 0) {
        setHoverIndex(null);
        tooltip.hide();
        return;
      }
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left - margins.left;
      const my = e.clientY - rect.top - margins.top;
      if (mx < 0 || mx > plotWidth || my < 0 || my > plotHeight) {
        setHoverIndex(null);
        tooltip.hide();
        return;
      }
      const idx = findNearestXIndex(xs, xScale.invert(mx));
      if (idx < 0) {
        setHoverIndex(null);
        tooltip.hide();
        return;
      }
      const point = sortedPoints[idx]!;
      setHoverIndex(idx);
      tooltip.show(e.clientX, e.clientY, {
        title: point.label,
        rows: Number.isFinite(point.y)
          ? [
              {
                label: xFormat ? xFormat(point.x) : "Adj return",
                value: formatTooltipPct(point.y, true),
                color: point.y >= 0 ? "var(--polarity-pos)" : "var(--polarity-neg)",
              },
            ]
          : [],
        footer: point.n != null ? `n = ${point.n.toLocaleString("en-GB")}` : undefined,
      });
    },
    [
      sortedPoints,
      xs,
      xScale,
      margins.left,
      margins.top,
      plotWidth,
      plotHeight,
      tooltip,
      xFormat,
    ],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
    tooltip.hide();
  }, [tooltip]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <g transform={`translate(${margins.left},${margins.top})`}>
        <YAxis
          scale={yScale}
          height={plotHeight}
          format={yFormat}
          width={plotWidth}
        />

        {bandD && (
          <path
            d={bandD}
            fill="var(--ink)"
            fillOpacity={CHART_MARKS.areaOpacity}
            stroke="none"
          />
        )}

        <line
          x1={0}
          x2={plotWidth}
          y1={snapPx(zeroY)}
          y2={snapPx(zeroY)}
          stroke="var(--baseline)"
          strokeWidth={1}
          shapeRendering="crispEdges"
        />

        {lineD && (
          <path
            d={lineD}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={CHART_MARKS.lineWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {sortedPoints.map((p, i) =>
          Number.isFinite(p.y) ? (
            <circle
              key={`${p.x}-${p.label}`}
              cx={xScale(p.x)}
              cy={yScale(p.y)}
              r={CHART_MARKS.dotSize / 2}
              fill="var(--ink)"
              stroke="var(--surface)"
              strokeWidth={CHART_MARKS.markerRing}
              opacity={
                hoverIndex != null && hoverIndex !== i ? CHART_MARKS.fadedOpacity : 1
              }
            />
          ) : null,
        )}

        <g transform={`translate(0,${plotHeight})`}>
          <line
            x1={0}
            x2={plotWidth}
            y1={snapPx(0)}
            y2={snapPx(0)}
            stroke="var(--baseline)"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
          {sortedPoints.map((p) => {
            const x = xScale(p.x);
            const label = xFormat ? xFormat(p.x) : p.label;
            const labelW = estimateTextWidth(label, 11);
            const clampedX = clampLabelX(x, labelW, 2, plotWidth - 2);
            const nText = p.n != null ? String(p.n) : null;
            const nW = nText ? estimateTextWidth(nText, 10) : 0;
            const clampedNX = nText ? clampLabelX(x, nW, 2, plotWidth - 2) : x;
            return (
              <g key={`tick-${p.x}-${p.label}`}>
                <text
                  x={clampedX}
                  y={16}
                  textAnchor="middle"
                  fill="var(--muted)"
                  fontSize={11}
                  className={TABULAR_CLASS}
                  style={{ textRendering: "geometricPrecision" }}
                >
                  {label}
                </text>
                {nText && (
                  <text
                    x={clampedNX}
                    y={28}
                    textAnchor="middle"
                    fill="var(--muted)"
                    fontSize={10}
                    className={TABULAR_CLASS}
                  >
                    {nText}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
}
