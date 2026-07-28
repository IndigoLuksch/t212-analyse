"use client";

import { useMemo, useState } from "react";
import { CHART_MARKS } from "./constants";
import { formatTooltipGbp, formatTooltipPct } from "./format";
import { useTooltip } from "./TooltipLayer";
import type { ScaleLinear } from "d3-scale";

export interface ScatterPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  size: number;
  color?: string;
  open?: boolean;
}

interface ScatterPlotProps {
  points: ScatterPoint[];
  xScale: ScaleLinear<number, number>;
  yScale: ScaleLinear<number, number>;
  width: number;
  height: number;
  referenceY?: number;
  referenceLabel?: string;
}

export function ScatterPlot({
  points,
  xScale,
  yScale,
  width,
  height,
  referenceY,
  referenceLabel,
}: ScatterPlotProps) {
  const tooltip = useTooltip();
  const [hoverId, setHoverId] = useState<string | null>(null);

  const maxSize = useMemo(() => Math.max(...points.map((p) => p.size), 1), [points]);

  const radius = (size: number) =>
    Math.max(CHART_MARKS.markerMinSize / 2, (size / maxSize) * 16);

  const findNearest = (mx: number, my: number): ScatterPoint | null => {
    let best: ScatterPoint | null = null;
    let bestDist = Infinity;
    for (const p of points) {
      const px = xScale(p.x);
      const py = yScale(p.y);
      const dist = Math.hypot(px - mx, py - my);
      const threshold = Math.max(CHART_MARKS.hitTargetMin / 2, radius(p.size));
      if (dist < threshold && dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
    return best;
  };

  const refY = referenceY != null ? yScale(referenceY) : null;

  return (
    <g>
      {refY != null && (
        <g>
          <line x1={0} x2={width} y1={refY} y2={refY} stroke="var(--baseline)" strokeWidth={1} />
          {referenceLabel && (
            <text
              x={width - 4}
              y={refY - 4}
              textAnchor="end"
              fill="var(--muted)"
              fontSize={10}
            >
              {referenceLabel}
            </text>
          )}
        </g>
      )}
      {points.map((p) => {
        const cx = xScale(p.x);
        const cy = yScale(p.y);
        const r = radius(p.size);
        const color = p.color ?? (p.open ? "var(--slot-1)" : "var(--muted)");
        const dimmed = hoverId != null && hoverId !== p.id;
        return (
          <circle
            key={p.id}
            cx={cx}
            cy={cy}
            r={r}
            fill={color}
            stroke="var(--surface)"
            strokeWidth={CHART_MARKS.markerRing}
            opacity={dimmed ? CHART_MARKS.fadedOpacity : 1}
          />
        );
      })}
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="transparent"
        onMouseMove={(e) => {
          // The rect spans the plot, so its own client rect is the plot's origin —
          // measuring against the owner SVG would be off by the margins.
          const rect = e.currentTarget.getBoundingClientRect();
          const point = findNearest(e.clientX - rect.left, e.clientY - rect.top);
          setHoverId(point?.id ?? null);
          if (!point) {
            tooltip.hide();
            return;
          }
          tooltip.show(e.clientX, e.clientY, {
            title: point.name,
            rows: [
              {
                label: "Annual return (XIRR)",
                value: formatTooltipPct(point.y, true),
                color: point.color ?? (point.open ? "var(--slot-1)" : "var(--muted)"),
              },
              { label: "Hold time", value: `${point.x.toFixed(1)}y` },
              { label: "Capital deployed", value: formatTooltipGbp(point.size) },
            ],
            footer: point.open ? "open position" : "closed",
          });
        }}
        onMouseLeave={() => {
          setHoverId(null);
          tooltip.hide();
        }}
      />
    </g>
  );
}
