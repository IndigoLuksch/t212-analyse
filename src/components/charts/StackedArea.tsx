"use client";

import { area } from "d3-shape";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { CHART_MARKS, SLOT_COLORS } from "./constants";
import { formatAxisDateShort, formatTooltipGbp, formatTooltipPct } from "./format";
import { useCrosshairOptional } from "./CrosshairContext";
import { useTooltip } from "./TooltipLayer";
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
  /** `"hovered"` (default): one band under the pointer. `"all"`: crosshair lists every band. */
  tooltipMode?: "hovered" | "all";
  onBandClick?: (seriesId: string) => void;
}

const OTHER_COLOR = "var(--muted)";

export function StackedArea({
  series,
  dates,
  xScale,
  yScale,
  mode = "percent",
  tooltipMode = "hovered",
  onBandClick,
}: StackedAreaProps) {
  const id = useId();
  const crosshair = useCrosshairOptional();
  const tooltip = useTooltip();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const colored = series.slice(0, 8);
  const otherSeries = series.slice(8);
  const gap = CHART_MARKS.stackGap / 2;

  const plotWidth = Math.abs(xScale.range()[1]! - xScale.range()[0]!);
  const plotHeight = Math.abs(yScale.range()[0]! - yScale.range()[1]!);

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

  const formatVal = useCallback(
    (val: number) => (mode === "percent" ? formatTooltipPct(val) : formatTooltipGbp(val)),
    [mode],
  );

  // Crosshair lists every band only in "all" mode; "hovered" owns the pointer itself.
  useEffect(() => {
    if (!crosshair || tooltipMode !== "all") return;
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
          value: formatVal(val),
        } satisfies TooltipEntry;
      });
    });
    return () => crosshair.unregisterSeries(sid);
  }, [crosshair, id, dates, paths, layers, formatVal, tooltipMode]);

  const bandAt = useCallback(
    (idx: number, plotY: number) => {
      // Top-first so a shared boundary between bands prefers the upper one.
      for (let li = layers.length - 1; li >= 0; li--) {
        const layer = layers[li]!;
        const pt = layer[idx];
        if (!pt) continue;
        const y0 = pt[0];
        const y1 = pt[1];
        if (y1 - y0 <= 0) continue;
        const pyLo = Math.min(yScale(y0), yScale(y1));
        const pyHi = Math.max(yScale(y0), yScale(y1));
        if (plotY >= pyLo && plotY <= pyHi) {
          return { ...meta[li]!, val: y1 - y0 };
        }
      }
      return null;
    },
    [layers, meta, yScale],
  );

  const handlePointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (dates.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const date = xScale.invert(mx);
    const idx = nearestDateIndex(dates, date);
    if (idx < 0) {
      setHoveredKey(null);
      tooltip.hide();
      return;
    }
    const band = bandAt(idx, my);
    setHoveredKey(band?.key ?? null);
    if (!band) {
      tooltip.hide();
      return;
    }
    const label =
      band.key === "other" ? `Other · ${otherSeries.length} stocks` : band.name;
    tooltip.show(e.clientX, e.clientY, {
      title: formatAxisDateShort(dates[idx]!),
      rows: [{ label, value: formatVal(band.val), color: band.color }],
      footer: "click to open",
    });
  };

  const handlePointerLeave = () => {
    setHoveredKey(null);
    tooltip.hide();
  };

  const handleClick = (e: React.MouseEvent<SVGRectElement>) => {
    if (!onBandClick || dates.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const idx = nearestDateIndex(dates, xScale.invert(mx));
    if (idx < 0) return;
    const band = bandAt(idx, my);
    if (band && band.key !== "other") onBandClick(band.key);
  };

  return (
    <g>
      {paths.map((p) => {
        const opacity =
          hoveredKey == null || hoveredKey === p.key ? 1 : CHART_MARKS.fadedOpacity;
        return (
          <path
            key={p.key}
            d={p.d}
            fill={p.color}
            fillOpacity={opacity * (p.key === "other" ? 0.5 : 0.85)}
            stroke="none"
            style={{ cursor: onBandClick && p.key !== "other" ? "pointer" : undefined }}
            pointerEvents={tooltipMode === "hovered" ? "none" : undefined}
            onMouseEnter={tooltipMode === "all" ? () => setHoveredKey(p.key) : undefined}
            onMouseLeave={tooltipMode === "all" ? () => setHoveredKey(null) : undefined}
            onClick={
              tooltipMode === "all" && onBandClick && p.key !== "other"
                ? () => onBandClick(p.key)
                : undefined
            }
          />
        );
      })}
      {tooltipMode === "hovered" && (
        <rect
          x={0}
          y={0}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          style={{ cursor: onBandClick ? "pointer" : undefined }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onClick={handleClick}
        />
      )}
    </g>
  );
}
