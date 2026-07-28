"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { CrosshairProvider, useCrosshair } from "./CrosshairContext";
import { useTooltip } from "./TooltipLayer";
import { DEFAULT_MARGINS } from "./constants";
import { formatAxisDateShort, snapPx } from "./format";
import { nearestDateIndex } from "./scales";
import type { ChartMargins } from "./types";
import type { ScaleTime } from "d3-scale";

interface ChartPlotProps {
  width: number;
  height: number;
  dates: Date[];
  xScale: ScaleTime<number, number>;
  margins?: ChartMargins;
  children: (props: { plotWidth: number; plotHeight: number }) => ReactNode;
  bottomAxis?: ReactNode;
  leftAxis?: ReactNode;
  /** Off when the mark owns its own tooltip (allocation stack). The line stays. */
  crosshairTooltip?: boolean;
}

function ChartPlotInner({
  width,
  height,
  dates,
  xScale,
  margins = DEFAULT_MARGINS,
  children,
  bottomAxis,
  leftAxis,
  crosshairTooltip = true,
}: ChartPlotProps) {
  const crosshair = useCrosshair();
  const tooltip = useTooltip();
  const svgRef = useRef<SVGSVGElement>(null);
  const plotWidth = width - margins.left - margins.right;
  const plotHeight = height - margins.top - margins.bottom;

  // On the <svg>, not on a capture rect over the plot: a rect on top would
  // swallow the mouseenter of every mark that has its own tooltip.
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || dates.length === 0) return;
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left - margins.left;
      const my = e.clientY - rect.top - margins.top;
      if (mx < 0 || mx > plotWidth || my < 0 || my > plotHeight) {
        crosshair.clearPointer();
        tooltip.hide();
        return;
      }
      const date = xScale.invert(mx);
      const idx = nearestDateIndex(dates, date);
      const snapped = dates[idx]!;
      const entries = crosshair.handlePointer(xScale(snapped), snapped);
      // When a mark owns the tooltip (allocation stack), keep the line but
      // do not touch the tooltip — otherwise every move would clear it.
      if (!crosshairTooltip) return;
      if (entries.length === 0) {
        tooltip.hide();
        return;
      }
      tooltip.show(e.clientX, e.clientY, {
        title: formatAxisDateShort(snapped),
        rows: entries.map((entry) => ({
          label: entry.seriesName,
          value: entry.value,
          color: entry.color,
        })),
      });
    },
    [
      dates,
      xScale,
      margins.left,
      margins.top,
      plotWidth,
      plotHeight,
      crosshair,
      tooltip,
      crosshairTooltip,
    ],
  );

  const handleMouseLeave = useCallback(() => {
    crosshair.clearPointer();
    tooltip.hide();
  }, [crosshair, tooltip]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <g transform={`translate(${margins.left},${margins.top})`}>
        {leftAxis && <g>{leftAxis}</g>}
        <g>{children({ plotWidth, plotHeight })}</g>
        {bottomAxis && <g transform={`translate(0,${plotHeight})`}>{bottomAxis}</g>}
        {crosshair.x != null && (
          <line
            x1={snapPx(crosshair.x)}
            x2={snapPx(crosshair.x)}
            y1={0}
            y2={plotHeight}
            stroke="var(--baseline)"
            strokeWidth={1}
            shapeRendering="crispEdges"
            pointerEvents="none"
          />
        )}
      </g>
    </svg>
  );
}

export function ChartPlot(props: ChartPlotProps) {
  return (
    <CrosshairProvider>
      <ChartPlotInner {...props} />
    </CrosshairProvider>
  );
}
