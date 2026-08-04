"use client";

import { useMemo, useState } from "react";
import { CHART_MARKS } from "./constants";
import { formatTooltipGbp, formatTooltipPct, snapPx } from "./format";
import { estimateTextWidth } from "./layout";
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

export interface ScatterReference {
  value: number;
  label?: string;
  color?: string;
}

interface ScatterPlotProps {
  points: ScatterPoint[];
  xScale: ScaleLinear<number, number>;
  yScale: ScaleLinear<number, number>;
  width: number;
  height: number;
  /** Horizontal reference lines, drawn back-to-front. */
  references?: ScatterReference[];
  /** When set, clicking the nearest point reports its id. */
  onPointClick?: (id: string) => void;
}

const R_MIN = 4;
const R_MAX = 14;

export function ScatterPlot({
  points,
  xScale,
  yScale,
  width,
  height,
  references,
  onPointClick,
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

  /**
   * Lay each label out independently, then nudge any that would land on top of
   * an earlier one — two benchmarks often sit within a few percent of each
   * other, which would otherwise overprint the text.
   */
  const refLayouts = useMemo(() => {
    const laidOut: {
      key: string;
      y: number;
      color: string;
      label?: string;
      textX: number;
      textY: number;
      textAnchor: 'start' | 'end';
      rectX: number;
      rectY: number;
      rectW: number;
      rectH: number;
    }[] = [];

    for (const [i, ref] of (references ?? []).entries()) {
      const refY = yScale(ref.value);
      const color = ref.color ?? 'var(--baseline)';
      if (!ref.label) {
        laidOut.push({
          key: `ref-${i}`,
          y: refY,
          color,
          textX: 0,
          textY: 0,
          textAnchor: 'start',
          rectX: 0,
          rectY: 0,
          rectW: 0,
          rectH: 0,
        });
        continue;
      }

      const near = points.filter((p) => Math.abs(yScale(p.y) - refY) < 40);
      const above = near.filter((p) => yScale(p.y) < refY).length;
      const below = near.length - above;
      let labelAbove = above <= below;

      const rightEdge = near.filter((p) => xScale(p.x) > width - 80).length;
      const leftEdge = near.filter((p) => xScale(p.x) < 80).length;
      const atRight = rightEdge <= leftEdge;

      const pad = 2;
      const fontSize = 10;
      const textW = estimateTextWidth(ref.label, 10);
      const textH = fontSize + 2;

      // Flip to the other side of the line if this label would collide.
      const collides = (ty: number) =>
        laidOut.some((l) => l.label && Math.abs(l.textY - ty) < textH + pad * 2);
      let textY = labelAbove ? refY - 4 : refY + fontSize + 2;
      if (collides(textY)) {
        labelAbove = !labelAbove;
        textY = labelAbove ? refY - 4 : refY + fontSize + 2;
      }

      const textX = atRight ? width - 4 : 4;
      laidOut.push({
        key: `ref-${i}`,
        y: refY,
        color,
        label: ref.label,
        textX,
        textY,
        textAnchor: atRight ? ('end' as const) : ('start' as const),
        rectX: atRight ? textX - textW - pad : textX - pad,
        rectY: textY - fontSize - pad,
        rectW: textW + pad * 2,
        rectH: textH + pad * 2,
      });
    }
    return laidOut;
  }, [references, points, xScale, yScale, width]);

  return (
    <g>
      {refLayouts.map((ref) => (
        <g key={ref.key}>
          <line
            x1={0}
            x2={width}
            y1={snapPx(ref.y)}
            y2={snapPx(ref.y)}
            stroke={ref.color}
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
          {ref.label && (
            <g>
              <rect
                x={ref.rectX}
                y={ref.rectY}
                width={ref.rectW}
                height={ref.rectH}
                rx={2}
                fill="var(--surface)"
              />
              <text
                x={ref.textX}
                y={ref.textY}
                textAnchor={ref.textAnchor}
                fill="var(--muted)"
                fontSize={10}
              >
                {ref.label}
              </text>
            </g>
          )}
        </g>
      ))}
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
            tabIndex={onPointClick ? 0 : undefined}
            role={onPointClick ? "button" : undefined}
            aria-label={onPointClick ? `${p.name}: open stock` : undefined}
            className={
              onPointClick
                ? "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
                : undefined
            }
            onFocus={onPointClick ? () => setHoverId(p.id) : undefined}
            onBlur={onPointClick ? () => setHoverId(null) : undefined}
            onKeyDown={
              onPointClick
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPointClick(p.id);
                    }
                  }
                : undefined
            }
          />
        );
      })}
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="transparent"
        style={{ cursor: onPointClick && hoverId != null ? "pointer" : undefined }}
        onClick={
          onPointClick
            ? (e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const point = findNearest(e.clientX - rect.left, e.clientY - rect.top);
                if (point) onPointClick(point.id);
              }
            : undefined
        }
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
