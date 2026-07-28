"use client";

import { useMemo, useState } from "react";
import { CHART_MARKS } from "./constants";
import { formatTooltipGbp } from "./format";
import type { TooltipEntry } from "./types";
import { StandaloneTooltip } from "./CrosshairTooltip";
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
  height: number;
  gap?: number;
}

export function ColumnSeries({
  data,
  xScale,
  yScale,
  width,
  height,
  gap = CHART_MARKS.stackGap,
}: ColumnSeriesProps) {
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    entry: TooltipEntry;
    date: Date;
  } | null>(null);

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

  return (
    <g
      onMouseLeave={() => setHover(null)}
    >
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
            onMouseEnter={(e) => {
              const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              setHover({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                date: bar.d.date,
                entry: {
                  seriesId: `col-${i}`,
                  seriesName: "Net flow",
                  color: bar.color,
                  value: formatTooltipGbp(bar.d.value),
                },
              });
            }}
          />
        </g>
      ))}
      {hover && (
        <foreignObject x={0} y={0} width={width} height={height} style={{ overflow: "visible", pointerEvents: "none" }}>
          <StandaloneTooltip
            x={hover.x}
            y={hover.y}
            date={hover.date}
            entries={[hover.entry]}
            containerWidth={width}
          />
        </foreignObject>
      )}
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
