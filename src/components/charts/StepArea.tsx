"use client";

import { area, curveStepAfter, line } from "d3-shape";
import { useEffect, useId, useMemo } from "react";
import { CHART_MARKS } from "./constants";
import { useCrosshairOptional } from "./CrosshairContext";
import type { DatePoint, TooltipEntry } from "./types";
import type { ScaleLinear, ScaleTime } from "d3-scale";
import { nearestDateIndex } from "./scales";

interface StepAreaProps {
  data: DatePoint[];
  xScale: ScaleTime<number, number>;
  yScale: ScaleLinear<number, number>;
  color?: string;
  seriesId?: string;
  seriesName?: string;
  formatValue?: (v: number) => string;
}

export function StepArea({
  data,
  xScale,
  yScale,
  color = "var(--slot-1)",
  seriesId,
  seriesName = "Shares held",
  formatValue = (v) => String(v),
}: StepAreaProps) {
  const id = useId();
  const crosshair = useCrosshairOptional();
  const sid = seriesId ?? id;

  const areaD = useMemo(() => {
    const gen = area<DatePoint>()
      .x((d) => xScale(d.date))
      .y0(yScale(0))
      .y1((d) => yScale(d.value))
      .curve(curveStepAfter)
      .defined((d) => Number.isFinite(d.value));
    return gen(data) ?? "";
  }, [data, xScale, yScale]);

  const edgeD = useMemo(() => {
    const gen = line<DatePoint>()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.value))
      .curve(curveStepAfter)
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

  return (
    <g>
      {areaD && (
        <path d={areaD} fill={color} fillOpacity={CHART_MARKS.areaOpacity} stroke="none" />
      )}
      {edgeD && (
        <path
          d={edgeD}
          fill="none"
          stroke={color}
          strokeWidth={CHART_MARKS.lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </g>
  );
}
