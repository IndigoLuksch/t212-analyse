"use client";

import { line } from "d3-shape";
import { useEffect, useId, useMemo } from "react";
import { CHART_MARKS } from "./constants";
import { useCrosshairOptional } from "./CrosshairContext";
import type { DatePoint, TooltipEntry } from "./types";
import type { ScaleLinear, ScaleTime } from "d3-scale";
import { nearestDateIndex } from "./scales";

interface LineSeriesProps {
  data: DatePoint[];
  xScale: ScaleTime<number, number>;
  yScale: ScaleLinear<number, number>;
  color?: string;
  opacity?: number;
  seriesId?: string;
  seriesName?: string;
  formatValue?: (v: number) => string;
}

export function LineSeries({
  data,
  xScale,
  yScale,
  color = "var(--slot-1)",
  opacity = 1,
  seriesId,
  seriesName = "Series",
  formatValue = (v) => String(v),
}: LineSeriesProps) {
  const id = useId();
  const crosshair = useCrosshairOptional();
  const sid = seriesId ?? id;

  const pathD = useMemo(() => {
    const gen = line<DatePoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value))
      .defined((d) => Number.isFinite(d.value));
    return gen(data) ?? "";
  }, [data, xScale, yScale]);

  useEffect(() => {
    if (!crosshair) return;
    const dates = data.map((d) => d.date);
    crosshair.registerSeries(sid, "default", (date) => {
      const idx = nearestDateIndex(dates, date);
      const pt = data[idx];
      if (!pt) return [];
      return [
        {
          seriesId: sid,
          seriesName,
          color,
          value: formatValue(pt.value),
        } satisfies TooltipEntry,
      ];
    });
    return () => crosshair.unregisterSeries(sid);
  }, [crosshair, sid, data, seriesName, color, formatValue]);

  if (!pathD) return null;

  return (
    <path
      d={pathD}
      fill="none"
      stroke={color}
      strokeWidth={CHART_MARKS.lineWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={opacity}
    />
  );
}
