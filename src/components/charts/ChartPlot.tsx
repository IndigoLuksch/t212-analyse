"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { CrosshairProvider, useCrosshair } from "./CrosshairContext";
import { CrosshairTooltip } from "./CrosshairTooltip";
import { DEFAULT_MARGINS } from "./constants";
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
}: ChartPlotProps) {
  const crosshair = useCrosshair();
  const svgRef = useRef<SVGSVGElement>(null);
  const plotWidth = width - margins.left - margins.right;
  const plotHeight = height - margins.top - margins.bottom;

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const svg = svgRef.current;
      if (!svg || dates.length === 0) return;
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left - margins.left;
      if (mx < 0 || mx > plotWidth) {
        crosshair.clearPointer();
        return;
      }
      const date = xScale.invert(mx);
      const idx = nearestDateIndex(dates, date);
      const snapped = dates[idx]!;
      crosshair.handlePointer(xScale(snapped), snapped);
    },
    [dates, xScale, margins.left, plotWidth, crosshair],
  );

  return (
    <svg ref={svgRef} width={width} height={height} className="select-none">
      <g transform={`translate(${margins.left},${margins.top})`}>
        {leftAxis && <g>{leftAxis}</g>}
        <g>{children({ plotWidth, plotHeight })}</g>
        {bottomAxis && <g transform={`translate(0,${plotHeight})`}>{bottomAxis}</g>}
        <rect
          x={0}
          y={0}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => crosshair.clearPointer()}
        />
        <CrosshairTooltip
          x={crosshair.x}
          y={plotHeight}
          date={crosshair.date}
          entries={crosshair.entries}
          plotWidth={plotWidth}
          plotLeft={0}
        />
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
