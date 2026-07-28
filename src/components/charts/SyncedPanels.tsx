"use client";

import {
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { CrosshairProvider, useCrosshair } from "./CrosshairContext";
import { CrosshairTooltip } from "./CrosshairTooltip";
import { DEFAULT_MARGINS } from "./constants";
import { nearestDateIndex } from "./scales";
import type { ChartMargins } from "./types";
import type { ScaleTime } from "d3-scale";

export interface SyncedPanelConfig {
  id: string;
  height: number;
  render: (props: {
    plotWidth: number;
    plotHeight: number;
    xScale: ScaleTime<number, number>;
    panelId: string;
  }) => ReactNode;
}

interface SyncedPanelsProps {
  width: number;
  dates: Date[];
  xScale: ScaleTime<number, number>;
  panels: SyncedPanelConfig[];
  margins?: ChartMargins;
  bottomAxis?: ReactNode;
}

function SyncedPanelsInner({
  width,
  dates,
  xScale,
  panels,
  margins = DEFAULT_MARGINS,
  bottomAxis,
}: SyncedPanelsProps) {
  const crosshair = useCrosshair();
  const containerRef = useRef<SVGSVGElement>(null);

  const plotWidth = width - margins.left - margins.right;
  const totalPlotHeight = panels.reduce((s, p) => s + p.height, 0);
  const svgHeight = totalPlotHeight + margins.top + margins.bottom;

  const panelOffsets = useMemo(() => {
    let y = margins.top;
    return panels.map((p) => {
      const offset = y;
      y += p.height;
      return offset;
    });
  }, [panels, margins.top]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const svg = containerRef.current;
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
    <svg ref={containerRef} width={width} height={svgHeight} className="select-none">
      <g transform={`translate(${margins.left},0)`}>
        {panels.map((panel, i) => (
          <g key={panel.id} transform={`translate(0,${panelOffsets[i]})`}>
            <clipPath id={`clip-${panel.id}`}>
              <rect x={0} y={0} width={plotWidth} height={panel.height} />
            </clipPath>
            <g clipPath={`url(#clip-${panel.id})`}>
              {panel.render({
                plotWidth,
                plotHeight: panel.height,
                xScale,
                panelId: panel.id,
              })}
            </g>
          </g>
        ))}

        <rect
          x={0}
          y={margins.top}
          width={plotWidth}
          height={totalPlotHeight}
          fill="transparent"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => crosshair.clearPointer()}
        />

        {crosshair.x != null && (
          <g transform={`translate(0,${margins.top})`}>
            <CrosshairTooltip
              x={crosshair.x}
              y={totalPlotHeight}
              date={crosshair.date}
              entries={crosshair.entries}
              plotWidth={plotWidth}
              plotLeft={0}
            />
          </g>
        )}

        {bottomAxis && (
          <g transform={`translate(0,${margins.top + totalPlotHeight})`}>{bottomAxis}</g>
        )}
      </g>
    </svg>
  );
}

export function SyncedPanels(props: SyncedPanelsProps) {
  return (
    <CrosshairProvider>
      <SyncedPanelsInner {...props} />
    </CrosshairProvider>
  );
}
