"use client";

import { CHART_MARKS } from "./constants";
import { formatTooltipGbp } from "./format";
import { TABULAR_CLASS } from "./format";

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
}

export function DivergingBars({
  data,
  width,
  barHeight = 20,
  gap = 8,
  maxValue,
}: DivergingBarsProps) {
  const max = maxValue ?? Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const centerX = width / 2;
  const plotWidth = width / 2 - 80;

  return (
    <svg width={width} height={data.length * (barHeight + gap)}>
      <line
        x1={centerX}
        x2={centerX}
        y1={0}
        y2={data.length * (barHeight + gap)}
        stroke="var(--baseline)"
        strokeWidth={1}
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
          <g key={d.id}>
            <text
              x={8}
              y={y + barHeight / 2}
              dy="0.32em"
              fill="var(--ink-secondary)"
              fontSize={12}
            >
              {d.name}
            </text>
            <path d={path} fill={color} />
            <text
              x={labelX}
              y={y + barHeight / 2}
              dy="0.32em"
              textAnchor={isPos ? "start" : "end"}
              fill="var(--ink)"
              fontSize={12}
              className={TABULAR_CLASS}
            >
              {formatTooltipGbp(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
