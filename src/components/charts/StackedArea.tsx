"use client";

import { area } from "d3-shape";
import { useEffect, useId, useMemo, useState } from "react";
import { CHART_MARKS, SLOT_COLORS } from "./constants";
import { formatTooltipPct } from "./format";
import { useCrosshairOptional } from "./CrosshairContext";
import type { DatePoint, TooltipEntry } from "./types";
import type { ScaleLinear, ScaleTime } from "d3-scale";
import { nearestDateIndex } from "./scales";
import { stack, stackOrderNone } from "d3-shape";

export interface StackedSeries {
  id: string;
  name: string;
  color?: string;
  slot?: number;
  data: DatePoint[];
}

interface StackedAreaProps {
  series: StackedSeries[];
  dates: Date[];
  xScale: ScaleTime<number, number>;
  yScale: ScaleLinear<number, number>;
  mode?: "percent" | "absolute";
  onBandClick?: (seriesId: string) => void;
}

const OTHER_COLOR = "var(--muted)";

export function StackedArea({
  series,
  dates,
  xScale,
  yScale,
  mode = "percent",
  onBandClick,
}: StackedAreaProps) {
  const id = useId();
  const crosshair = useCrosshairOptional();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const colored = series.slice(0, 8);
  const otherSeries = series.slice(8);
  const gap = CHART_MARKS.stackGap / 2;

  const { layers, meta } = useMemo(() => {
    const keys = colored.map((s) => s.id);
    if (otherSeries.length > 0) keys.push("other");

    const rows = dates.map((date, di) => {
      const row: Record<string, number> = {};
      let total = 0;
      for (const s of colored) {
        const v = s.data[di]?.value ?? 0;
        row[s.id] = v;
        total += v;
      }
      if (otherSeries.length > 0) {
        let otherVal = 0;
        for (const s of otherSeries) otherVal += s.data[di]?.value ?? 0;
        row.other = otherVal;
        total += otherVal;
      }
      if (mode === "percent" && total > 0) {
        for (const k of keys) row[k] = (row[k] ?? 0) / total;
      }
      return row;
    });

    const stackGen = stack<Record<string, number>>()
      .keys(keys)
      .order(stackOrderNone)
      .value((d, key) => d[key] ?? 0);

    const stacked = stackGen(rows);
    const metaMap = keys.map((key, li) => {
      const s = colored.find((c) => c.id === key);
      const color =
        key === "other"
          ? OTHER_COLOR
          : s?.color ?? SLOT_COLORS[(s?.slot ?? li) % 8] ?? SLOT_COLORS[0];
      const name = key === "other" ? "Other" : s?.name ?? key;
      return { key, color, name };
    });

    return { layers: stacked, meta: metaMap };
  }, [colored, otherSeries, dates, mode]);

  const paths = useMemo(() => {
    return layers.map((layer, li) => {
      const areaGen = area<[number, number]>()
        .x((_, i) => xScale(dates[i]!))
        .y0((d) => yScale(d[0]) + gap)
        .y1((d) => yScale(d[1]) - gap);

      const d = areaGen(layer as unknown as [number, number][]) ?? "";
      return { ...meta[li]!, d };
    });
  }, [layers, meta, dates, xScale, yScale, gap]);

  useEffect(() => {
    if (!crosshair) return;
    const sid = `stacked-${id}`;
    crosshair.registerSeries(sid, "default", (date) => {
      const idx = nearestDateIndex(dates, date);
      if (idx < 0) return [];
      return paths.map((p) => {
        const layer = layers.find((l) => l.key === p.key);
        const val = (layer?.[idx]?.[1] ?? 0) - (layer?.[idx]?.[0] ?? 0);
        return {
          seriesId: p.key,
          seriesName: p.name,
          color: p.color,
          value: mode === "percent" ? formatTooltipPct(val) : String(val),
        } satisfies TooltipEntry;
      });
    });
    return () => crosshair.unregisterSeries(sid);
  }, [crosshair, id, dates, paths, layers, mode]);

  return (
    <g>
      {paths.map((p) => {
        const opacity =
          hoveredId == null || hoveredId === p.key ? 1 : CHART_MARKS.fadedOpacity;
        return (
          <path
            key={p.key}
            d={p.d}
            fill={p.color}
            fillOpacity={opacity * (p.key === "other" ? 0.5 : 0.85)}
            stroke="none"
            style={{ cursor: onBandClick ? "pointer" : undefined }}
            onMouseEnter={() => setHoveredId(p.key)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => onBandClick?.(p.key)}
          />
        );
      })}
    </g>
  );
}
