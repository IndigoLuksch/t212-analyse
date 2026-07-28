"use client";

import { useMemo, useState } from "react";
import { CHART_MARKS } from "./constants";
import { formatTooltipGbp } from "./format";

export type TradeSide = "buy" | "sell";

export interface TradeMarker {
  id: string;
  date: Date;
  price: number;
  value: number;
  side: TradeSide;
  label?: string;
}

interface TradeMarkersProps {
  trades: TradeMarker[];
  xScale: (d: Date) => number;
  yScale: (v: number) => number;
  onMarkerClick?: (trade: TradeMarker) => void;
}

export function TradeMarkers({ trades, xScale, yScale, onMarkerClick }: TradeMarkersProps) {
  const maxValue = useMemo(() => Math.max(...trades.map((t) => t.value), 1), [trades]);
  const [hoverId, setHoverId] = useState<string | null>(null);

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
              style={{ cursor: onMarkerClick ? "pointer" : undefined }}
              onMouseEnter={() => setHoverId(t.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => onMarkerClick?.(t)}
            />
            {hoverId === t.id && t.label && (
              <title>{t.label}</title>
            )}
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

export function formatTradeLabel(t: TradeMarker): string {
  return `${t.side === "buy" ? "Buy" : "Sell"} · ${formatTooltipGbp(t.value)}`;
}
