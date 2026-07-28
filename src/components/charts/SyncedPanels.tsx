"use client";

import {
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { CrosshairProvider, useCrosshair } from "./CrosshairContext";
import { useTooltip } from "./TooltipLayer";
import { DEFAULT_MARGINS } from "./constants";
import { formatAxisDateShort, snapPx } from "./format";
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
  /** Off when the marks own their own tooltips. The line stays. */
  crosshairTooltip?: boolean;
}

function SyncedPanelsInner({
  width,
  dates,
  xScale,
  panels,
  margins = DEFAULT_MARGINS,
  bottomAxis,
  crosshairTooltip = true,
}: SyncedPanelsProps) {
  const crosshair = useCrosshair();
  const tooltip = useTooltip();
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

  // On the <svg>, not on a capture rect over the panels: a rect on top would
  // swallow the mouseenter of every mark that has its own tooltip.
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = containerRef.current;
      if (!svg || dates.length === 0) return;
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left - margins.left;
      const my = e.clientY - rect.top - margins.top;
      if (mx < 0 || mx > plotWidth || my < 0 || my > totalPlotHeight) {
        crosshair.clearPointer();
        tooltip.hide();
        return;
      }
      const date = xScale.invert(mx);
      const idx = nearestDateIndex(dates, date);
      const snapped = dates[idx]!;
      const entries = crosshair.handlePointer(xScale(snapped), snapped);
      if (!crosshairTooltip || entries.length === 0) {
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
      totalPlotHeight,
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
      ref={containerRef}
      width={width}
      height={svgHeight}
      className="select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
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

        {crosshair.x != null && (
          <line
            x1={snapPx(crosshair.x)}
            x2={snapPx(crosshair.x)}
            y1={margins.top}
            y2={margins.top + totalPlotHeight}
            stroke="var(--baseline)"
            strokeWidth={1}
            shapeRendering="crispEdges"
            pointerEvents="none"
          />
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
