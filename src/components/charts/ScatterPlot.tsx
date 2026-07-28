"use client";

import { useMemo, useState } from "react";
import { CHART_MARKS } from "./constants";
import { formatTooltipGbp, formatTooltipPct, snapPx } from "./format";
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

const R_MIN = 4;
const R_MAX = 14;

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

  // Area ∝ capital: radius scales with sqrt(size / maxSize).
  const radius = (size: number) => R_MIN + (R_MAX - R_MIN) * Math.sqrt(size / maxSize);

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

  const refLabelLayout = useMemo(() => {
    if (refY == null || !referenceLabel) return null;
    const near = points.filter((p) => Math.abs(yScale(p.y) - refY) < 40);
    const above = near.filter((p) => yScale(p.y) < refY).length;
    const below = near.length - above;
    const labelAbove = above <= below;

    const rightEdge = near.filter((p) => xScale(p.x) > width - 80).length;
    const leftEdge = near.filter((p) => xScale(p.x) < 80).length;
    const atRight = rightEdge <= leftEdge;

    const pad = 2;
    const fontSize = 10;
    const textW = referenceLabel.length * 6.2;
    const textH = fontSize + 2;
    const textX = atRight ? width - 4 : 4;
    const textY = labelAbove ? refY - 4 : refY + fontSize + 2;
    const rectX = atRight ? textX - textW - pad : textX - pad;
    const rectY = textY - fontSize - pad;

    return {
      textX,
      textY,
      textAnchor: atRight ? ("end" as const) : ("start" as const),
      rectX,
      rectY,
      rectW: textW + pad * 2,
      rectH: textH + pad * 2,
    };
  }, [refY, referenceLabel, points, xScale, yScale, width]);

  return (
    <g>
      {refY != null && (
        <g>
          <line
            x1={0}
            x2={width}
            y1={snapPx(refY)}
            y2={snapPx(refY)}
            stroke="var(--baseline)"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
          {refLabelLayout && referenceLabel && (
            <g>
              <rect
                x={refLabelLayout.rectX}
                y={refLabelLayout.rectY}
                width={refLabelLayout.rectW}
                height={refLabelLayout.rectH}
                rx={2}
                fill="var(--surface)"
              />
              <text
                x={refLabelLayout.textX}
                y={refLabelLayout.textY}
                textAnchor={refLabelLayout.textAnchor}
                fill="var(--muted)"
                fontSize={10}
              >
                {referenceLabel}
              </text>
            </g>
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
