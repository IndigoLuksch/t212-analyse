"use client";

import { useMemo } from "react";
import { CHART_MARKS } from "./constants";
import { formatAxisDate, formatTooltipGbp } from "./format";
import { useTooltip } from "./TooltipLayer";
import type { ScaleBand, ScaleLinear, ScaleTime } from "d3-scale";

export interface ColumnDatum {
  date: Date;
  value: number;
  label?: string;
}

interface ColumnSeriesProps {
  data: ColumnDatum[];
  xScale: ScaleTime<number, number> | ScaleBand<string>;
  yScale: ScaleLinear<number, number>;
  width: number;
  gap?: number;
}

export function ColumnSeries({
  data,
  xScale,
  yScale,
  width,
  gap = CHART_MARKS.stackGap,
}: ColumnSeriesProps) {
  const tooltip = useTooltip();

  const zeroY = yScale(0);
  const barWidth = Math.min(
    CHART_MARKS.barMaxWidth,
    data.length > 0 ? width / data.length - gap : CHART_MARKS.barMaxWidth,
  );

  const bars = useMemo(() => {
    const isTime = "invert" in xScale && typeof (xScale as ScaleTime<number, number>).invert === "function";
    return data.map((d) => {
      const cx = isTime
        ? (xScale as ScaleTime<number, number>)(d.date)
        : (xScale as ScaleBand<string>)(d.label ?? d.date.toISOString()) ?? 0;
      const x = cx - barWidth / 2;
      const yVal = yScale(d.value);
      const isPositive = d.value >= 0;
      const y = isPositive ? yVal : zeroY;
      const h = Math.abs(zeroY - yVal);
      const color = isPositive ? "var(--polarity-pos)" : "var(--polarity-neg)";
      const radius = CHART_MARKS.barRadius;

      const path = isPositive
        ? roundedTopRect(x, y, barWidth, h, radius)
        : roundedBottomRect(x, y - h, barWidth, h, radius);

      return { d, x: cx, y, h, path, color };
    });
  }, [data, xScale, yScale, zeroY, barWidth]);

  const showBar = (e: React.MouseEvent, bar: (typeof bars)[number]) =>
    tooltip.show(e.clientX, e.clientY, {
      title: formatAxisDate(bar.d.date),
      rows: [
        { label: "Net flow", value: formatTooltipGbp(bar.d.value, true), color: bar.color },
      ],
    });

  return (
    <g onMouseLeave={() => tooltip.hide()}>
      <line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke="var(--baseline)" strokeWidth={1} />
      {bars.map((bar, i) => (
        <g key={i}>
          <path d={bar.path} fill={bar.color} />
          <rect
            x={bar.x - CHART_MARKS.hitTargetMin / 2}
            y={Math.min(bar.y, zeroY) - 4}
            width={CHART_MARKS.hitTargetMin}
            height={Math.max(bar.h, 4) + 8}
            fill="transparent"
            onMouseEnter={(e) => showBar(e, bar)}
            onMouseMove={(e) => {
              // The plot's crosshair handler sits on the <svg>; let the
              // specific month win over the generic date readout.
              e.stopPropagation();
              showBar(e, bar);
            }}
          />
        </g>
      ))}
    </g>
  );
}

function roundedTopRect(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return "";
  const rad = Math.min(r, w / 2, h);
  return `M ${x} ${y + h} L ${x} ${y + rad} Q ${x} ${y} ${x + rad} ${y} L ${x + w - rad} ${y} Q ${x + w} ${y} ${x + w} ${y + rad} L ${x + w} ${y + h} Z`;
}

function roundedBottomRect(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return "";
  const rad = Math.min(r, w / 2, h);
  const bottom = y + h;
  return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${bottom - rad} Q ${x + w} ${bottom} ${x + w - rad} ${bottom} L ${x + rad} ${bottom} Q ${x} ${bottom} ${x} ${bottom - rad} Z`;
}
