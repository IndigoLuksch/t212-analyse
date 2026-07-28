"use client";

import { useMemo } from "react";
import { CHART_MARKS } from "./constants";
import { useTooltip, type TooltipPayload } from "./TooltipLayer";

export type TradeSide = "buy" | "sell";

export interface TradeMarker {
  id: string;
  date: Date;
  price: number;
  value: number;
  side: TradeSide;
  /** Built by the caller — only it knows the fills, fees and post-exit returns. */
  tooltip: TooltipPayload;
}

interface TradeMarkersProps {
  trades: TradeMarker[];
  xScale: (d: Date) => number;
  yScale: (v: number) => number;
  onMarkerClick?: (trade: TradeMarker) => void;
}

export function TradeMarkers({ trades, xScale, yScale, onMarkerClick }: TradeMarkersProps) {
  const tooltip = useTooltip();
  const maxValue = useMemo(() => Math.max(...trades.map((t) => t.value), 1), [trades]);

  return (
    <g>
      {trades.map((t) => {
        const cx = xScale(t.date);
        const cy = yScale(t.price);
        const size = Math.max(
          CHART_MARKS.markerMinSize,
          (t.value / maxValue) * CHART_MARKS.markerMinSize * 2,
        );
        const color = t.side === "buy" ? "var(--polarity-pos)" : "var(--polarity-neg)";
        const path =
          t.side === "buy"
            ? triangleUp(cx, cy, size)
            : triangleDown(cx, cy, size);

        return (
          <g key={t.id}>
            <path d={path} fill={color} stroke="var(--surface)" strokeWidth={CHART_MARKS.markerRing} />
            <circle
              cx={cx}
              cy={cy}
              r={CHART_MARKS.hitTargetMin / 2}
              fill="transparent"
              tabIndex={0}
              className="outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              style={{ cursor: onMarkerClick ? "pointer" : undefined }}
              onMouseEnter={(e) => tooltip.show(e.clientX, e.clientY, t.tooltip)}
              onMouseMove={(e) => {
                // The plot's crosshair handler sits on the <svg>; let the
                // specific trade win over the generic date readout.
                e.stopPropagation();
                tooltip.show(e.clientX, e.clientY, t.tooltip);
              }}
              onMouseLeave={() => tooltip.hide()}
              onFocus={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                tooltip.show(
                  rect.left + rect.width / 2,
                  rect.top + rect.height / 2,
                  t.tooltip,
                );
              }}
              onBlur={() => tooltip.hide()}
              onClick={() => onMarkerClick?.(t)}
            />
          </g>
        );
      })}
    </g>
  );
}

function triangleUp(cx: number, cy: number, size: number): string {
  const h = size / 2;
  return `M ${cx} ${cy - h} L ${cx + h} ${cy + h * 0.6} L ${cx - h} ${cy + h * 0.6} Z`;
}

function triangleDown(cx: number, cy: number, size: number): string {
  const h = size / 2;
  return `M ${cx} ${cy + h} L ${cx + h} ${cy - h * 0.6} L ${cx - h} ${cy - h * 0.6} Z`;
}
