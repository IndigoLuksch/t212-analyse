"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseIsoDate } from "@/components/charts/format";
import type { RangeState } from "@/components/charts/TimeRangeControl";

export { parseIsoDate as parseDate, toIsoDate } from "@/components/charts/format";

export function toDatePoints(series: { date: string; value: number }[]) {
  return series.map((d) => ({ date: parseIsoDate(d.date), value: d.value }));
}

function clampRange(range: RangeState, min: string, max: string): RangeState {
  if (!min || !max) return range;
  const start = range.start < min ? min : range.start > max ? max : range.start;
  const end = range.end > max ? max : range.end < min ? min : range.end;
  if (start === range.start && end === range.end) return range;
  return { ...range, start, end };
}

export function useDateRange(opts: {
  min: string;
  max: string;
  initial: RangeState;
}): [RangeState, (r: RangeState) => void] {
  const { min, max, initial } = opts;
  const [range, setRange] = useState<RangeState>(() => clampRange(initial, min, max));

  // A sub-day brush drag resolves to the same two ISO dates; bail out so the charts don't rerender.
  const set = useCallback(
    (next: RangeState) =>
      setRange((prev) => {
        const clamped = clampRange(next, min, max);
        return prev.start === clamped.start &&
          prev.end === clamped.end &&
          prev.preset === clamped.preset
          ? prev
          : clamped;
      }),
    [min, max],
  );

  return [range, set];
}

/** Concrete start/end are always resolved in state, so charts and the brush read the same two values. */
export function clipToRange<T extends { date: string }>(data: T[], r: RangeState): T[] {
  if (!r.start && !r.end) return data;
  return data.filter((d) => {
    if (r.start && d.date < r.start) return false;
    if (r.end && d.date > r.end) return false;
    return true;
  });
}

export function useChartWidth(defaultWidth = 800) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(defaultWidth);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || defaultWidth);
    return () => ro.disconnect();
  }, [defaultWidth]);

  return { ref, width };
}
