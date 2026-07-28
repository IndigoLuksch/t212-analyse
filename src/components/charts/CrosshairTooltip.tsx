"use client";

import { formatAxisDateShort } from "./format";
import { TABULAR_CLASS } from "./format";
import type { TooltipEntry } from "./types";

interface CrosshairTooltipProps {
  x: number | null;
  y: number;
  date: Date | null;
  entries: TooltipEntry[];
  plotWidth: number;
  plotLeft: number;
}

export function CrosshairTooltip({
  x,
  y,
  date,
  entries,
  plotWidth,
  plotLeft,
}: CrosshairTooltipProps) {
  if (x == null || date == null || entries.length === 0) return null;

  const tooltipWidth = 180;
  const offsetX = x + plotLeft + 12 + tooltipWidth > plotWidth + plotLeft ? -tooltipWidth - 12 : 12;

  return (
    <g pointerEvents="none">
      <line
        x1={x}
        x2={x}
        y1={0}
        y2={y}
        stroke="var(--baseline)"
        strokeWidth={1}
      />
      <foreignObject
        x={x + offsetX}
        y={8}
        width={tooltipWidth}
        height={entries.length * 36 + 28}
      >
        <div
          className="rounded border border-border bg-surface px-3 py-2 shadow-sm"
          style={{ fontSize: 12 }}
        >
          <div className={`mb-1.5 text-muted ${TABULAR_CLASS}`}>
            {formatAxisDateShort(date)}
          </div>
          {entries.map((e) => (
            <div key={e.seriesId} className="flex items-start gap-2 py-0.5">
              <span
                className="mt-1.5 inline-block h-0.5 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: e.color }}
              />
              <div className="min-w-0 flex-1">
                <div className={`font-semibold text-ink ${TABULAR_CLASS}`}>{e.value}</div>
                <div className="truncate text-muted">{e.seriesName}</div>
              </div>
            </div>
          ))}
        </div>
      </foreignObject>
    </g>
  );
}

interface StandaloneTooltipProps {
  x: number;
  y: number;
  date: Date;
  entries: TooltipEntry[];
  containerWidth: number;
}

export function StandaloneTooltip({ x, y, date, entries, containerWidth }: StandaloneTooltipProps) {
  const tooltipWidth = 180;
  const offsetX = x + 12 + tooltipWidth > containerWidth ? -tooltipWidth - 12 : 12;

  return (
    <div
      className="pointer-events-none absolute z-10 rounded border border-border bg-surface px-3 py-2 shadow-sm"
      style={{ left: x + offsetX, top: y + 8, width: tooltipWidth, fontSize: 12 }}
    >
      <div className={`mb-1.5 text-muted ${TABULAR_CLASS}`}>{formatAxisDateShort(date)}</div>
      {entries.map((e) => (
        <div key={e.seriesId} className="flex items-start gap-2 py-0.5">
          <span
            className="mt-1.5 inline-block h-0.5 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: e.color }}
          />
          <div className="min-w-0 flex-1">
            <div className={`font-semibold text-ink ${TABULAR_CLASS}`}>{e.value}</div>
            <div className="truncate text-muted">{e.seriesName}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
