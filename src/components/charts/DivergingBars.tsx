"use client";

import { CHART_MARKS } from "./constants";
import { formatTooltipGbp, snapPx, TABULAR_CLASS } from "./format";

export interface DivergingBarDatum {
  id: string;
  name: string;
  value: number;
}

interface DivergingBarsProps {
  data: DivergingBarDatum[];
  width: number;
  barHeight?: number;
  gap?: number;
  maxValue?: number;
  formatValue?: (n: number) => string;
  /** When set, each row becomes a button that reports its datum id. */
  onBarClick?: (id: string) => void;
}

export function DivergingBars({
  data,
  width,
  barHeight = 20,
  gap = 8,
  maxValue,
  formatValue = (n) => formatTooltipGbp(n),
  onBarClick,
}: DivergingBarsProps) {
  const max = maxValue ?? Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const centerX = width / 2;
  const plotWidth = width / 2 - 80;

  return (
    <svg width={width} height={data.length * (barHeight + gap)}>
      <line
        x1={snapPx(centerX)}
        x2={snapPx(centerX)}
        y1={0}
        y2={data.length * (barHeight + gap)}
        stroke="var(--baseline)"
        strokeWidth={1}
        shapeRendering="crispEdges"
      />
      {data.map((d, i) => {
        const y = i * (barHeight + gap);
        const barW = (Math.abs(d.value) / max) * plotWidth;
        const isPos = d.value >= 0;
        const x = isPos ? centerX : centerX - barW;
        const color = isPos ? "var(--polarity-pos)" : "var(--polarity-neg)";
        const path = isPos
          ? `M ${x} ${y} L ${x + barW - CHART_MARKS.barRadius} ${y} Q ${x + barW} ${y} ${x + barW} ${y + CHART_MARKS.barRadius} L ${x + barW} ${y + barHeight} L ${x} ${y + barHeight} Z`
          : `M ${x + barW} ${y} L ${x + CHART_MARKS.barRadius} ${y} Q ${x} ${y} ${x} ${y + CHART_MARKS.barRadius} L ${x} ${y + barHeight} L ${x + barW} ${y + barHeight} Z`;

        const labelX = isPos ? x + barW + 8 : x - 8;

        return (
          <g
            key={d.id}
            className={onBarClick ? "group/bar" : undefined}
            role={onBarClick ? "button" : undefined}
            tabIndex={onBarClick ? 0 : undefined}
            aria-label={onBarClick ? `${d.name}: open stock` : undefined}
            style={{ cursor: onBarClick ? "pointer" : undefined }}
            onClick={onBarClick ? () => onBarClick(d.id) : undefined}
            onKeyDown={
              onBarClick
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onBarClick(d.id);
                    }
                  }
                : undefined
            }
          >
            {/* Full-row hit area — the bar alone is a thin, sometimes tiny target. */}
            <rect
              x={0}
              y={y}
              width={width}
              height={barHeight}
              rx={CHART_MARKS.barRadius}
              fill="transparent"
              className={
                onBarClick
                  ? "group-hover/bar:fill-[var(--gridline)] group-focus/bar:fill-[var(--gridline)]"
                  : undefined
              }
            />
            <text
              x={8}
              y={y + barHeight / 2}
              dy="0.32em"
              fill="var(--ink-secondary)"
              fontSize={12}
              className={onBarClick ? "group-hover/bar:fill-[var(--ink)]" : undefined}
            >
              {d.name}
            </text>
            <path d={path} fill={color} pointerEvents="none" />
            <text
              x={labelX}
              y={y + barHeight / 2}
              dy="0.32em"
              textAnchor={isPos ? "start" : "end"}
              fill="var(--ink)"
              fontSize={12}
              className={TABULAR_CLASS}
              pointerEvents="none"
            >
              {formatValue(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
