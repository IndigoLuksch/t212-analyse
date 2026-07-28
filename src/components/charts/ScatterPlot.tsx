"use client";

import { useMemo, useState } from "react";
import { CHART_MARKS } from "./constants";
import { formatTooltipPct } from "./format";
import { StandaloneTooltip } from "./CrosshairTooltip";
import type { TooltipEntry } from "./types";
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
  const [hover, setHover] = useState<{
    point: ScatterPoint;
    px: number;
    py: number;
  } | null>(null);

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
    <g
      onMouseMove={(e) => {
        const svg = e.currentTarget.ownerSVGElement;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const pt = findNearest(mx, my);
        if (pt) setHover({ point: pt, px: xScale(pt.x), py: yScale(pt.y) });
        else setHover(null);
      }}
      onMouseLeave={() => setHover(null)}
    >
      <rect x={0} y={0} width={width} height={height} fill="transparent" />
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
        const dimmed = hover && hover.point.id !== p.id;
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
      {hover && (
        <foreignObject x={0} y={0} width={width} height={height} style={{ overflow: "visible", pointerEvents: "none" }}>
          <StandaloneTooltip
            x={hover.px}
            y={hover.py}
            date={new Date()}
            entries={[
              {
                seriesId: hover.point.id,
                seriesName: hover.point.name,
                color: hover.point.color ?? "var(--slot-1)",
                value: formatTooltipPct(hover.point.y, true),
              } satisfies TooltipEntry,
            ]}
            containerWidth={width}
          />
        </foreignObject>
      )}
    </g>
  );
}
