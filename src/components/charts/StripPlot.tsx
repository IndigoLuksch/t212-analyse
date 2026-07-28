"use client";

import { useMemo, useState } from "react";
import { CHART_MARKS } from "./constants";
import { formatTooltipPct } from "./format";
import { useTooltip } from "./TooltipLayer";
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
  const tooltip = useTooltip();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const cy = height / 2;
  const zeroX = xScale(0);

  const medianVal = useMemo(() => median(points, (p) => p.value) ?? 0, [points]);
  const medianX = xScale(medianVal);

  const extremes = useMemo(() => {
    if (points.length < 2) return [];
    const sorted = [...points].sort((a, b) => a.value - b.value);
    return [sorted[0]!, sorted[sorted.length - 1]!];
  }, [points]);

  const pointColor = (p: StripPoint) =>
    p.value <= 0 ? "var(--polarity-pos)" : "var(--polarity-neg)";

  // Nearest-point rather than per-circle hover: 8px circles inside 24px hit
  // targets overlap, so mouseenter picks whichever happens to be on top.
  const findNearest = (mx: number): StripPoint | null => {
    let best: StripPoint | null = null;
    let bestDist = Infinity;
    for (const p of points) {
      const dist = Math.abs(xScale(p.value) - mx);
      if (dist <= CHART_MARKS.hitTargetMin && dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
    return best;
  };

  return (
    <svg width={width} height={height + 24}>
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
      {points.map((p) => (
        <circle
          key={p.id}
          cx={xScale(p.value)}
          cy={cy}
          r={CHART_MARKS.markerMinSize / 2}
          fill={pointColor(p)}
          stroke="var(--surface)"
          strokeWidth={CHART_MARKS.markerRing}
          opacity={hoverId != null && hoverId !== p.id ? CHART_MARKS.fadedOpacity : 1}
        />
      ))}
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
      <rect
        x={0}
        y={0}
        width={width}
        height={height + 24}
        fill="transparent"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const point = findNearest(e.clientX - rect.left);
          setHoverId(point?.id ?? null);
          if (!point) {
            tooltip.hide();
            return;
          }
          tooltip.show(e.clientX, e.clientY, {
            title: point.name,
            rows: [
              {
                label: "Index-adjusted 6m return",
                value: formatTooltipPct(point.value / 100, true),
                color: pointColor(point),
              },
            ],
            footer: point.detail,
          });
        }}
        onMouseLeave={() => {
          setHoverId(null);
          tooltip.hide();
        }}
      />
    </svg>
  );
}
