"use client";

import { useMemo, useState } from "react";
import { CHART_MARKS } from "./constants";
import { formatTooltipPct } from "./format";
import { StandaloneTooltip } from "./CrosshairTooltip";
import type { TooltipEntry } from "./types";
import type { ScaleLinear } from "d3-scale";
import { median } from "d3-array";

export interface StripPoint {
  id: string;
  name: string;
  value: number;
  detail?: string;
}

interface StripPlotProps {
  points: StripPoint[];
  xScale: ScaleLinear<number, number>;
  width: number;
  height?: number;
  showMedian?: boolean;
}

export function StripPlot({
  points,
  xScale,
  width,
  height = 48,
  showMedian = true,
}: StripPlotProps) {
  const [hover, setHover] = useState<{ point: StripPoint; px: number } | null>(null);
  const cy = height / 2;
  const zeroX = xScale(0);

  const medianVal = useMemo(() => median(points, (p) => p.value) ?? 0, [points]);
  const medianX = xScale(medianVal);

  const extremes = useMemo(() => {
    if (points.length < 2) return [];
    const sorted = [...points].sort((a, b) => a.value - b.value);
    return [sorted[0]!, sorted[sorted.length - 1]!];
  }, [points]);

  return (
    <svg
      width={width}
      height={height + 24}
      onMouseLeave={() => setHover(null)}
    >
      <line x1={zeroX} x2={zeroX} y1={8} y2={height} stroke="var(--baseline)" strokeWidth={1} />
      <line x1={0} x2={width} y1={cy} y2={cy} stroke="var(--gridline)" strokeWidth={1} />
      {showMedian && (
        <g>
          <line
            x1={medianX}
            x2={medianX}
            y1={8}
            y2={height}
            stroke="var(--ink-secondary)"
            strokeWidth={1}
          />
          <text x={medianX} y={height + 16} textAnchor="middle" fill="var(--muted)" fontSize={10}>
            median
          </text>
        </g>
      )}
      {points.map((p) => {
        const cx = xScale(p.value);
        const color = p.value <= 0 ? "var(--polarity-pos)" : "var(--polarity-neg)";
        return (
          <circle
            key={p.id}
            cx={cx}
            cy={cy}
            r={CHART_MARKS.markerMinSize / 2}
            fill={color}
            stroke="var(--surface)"
            strokeWidth={CHART_MARKS.markerRing}
            onMouseEnter={() => setHover({ point: p, px: cx })}
          />
        );
      })}
      {extremes.map((p) => (
        <text
          key={`label-${p.id}`}
          x={xScale(p.value)}
          y={4}
          textAnchor="middle"
          fill="var(--ink-secondary)"
          fontSize={10}
        >
          {p.name}
        </text>
      ))}
      {hover && (
        <foreignObject x={0} y={0} width={width} height={height + 24} style={{ overflow: "visible", pointerEvents: "none" }}>
          <StandaloneTooltip
            x={hover.px}
            y={cy}
            date={new Date()}
            entries={[
              {
                seriesId: hover.point.id,
                seriesName: hover.point.name,
                color: hover.point.value <= 0 ? "var(--polarity-pos)" : "var(--polarity-neg)",
                value: formatTooltipPct(hover.point.value / 100, true),
              } satisfies TooltipEntry,
            ]}
            containerWidth={width}
          />
        </foreignObject>
      )}
    </svg>
  );
}
