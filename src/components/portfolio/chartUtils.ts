"use client";

import { useEffect, useRef, useState } from "react";
import type { TimeRangeValue } from "@/components/charts";

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export function toDatePoints(series: { date: string; value: number }[]) {
  return series.map((d) => ({ date: parseDate(d.date), value: d.value }));
}

export function filterByRange<T extends { date: string }>(
  data: T[],
  range: TimeRangeValue,
  minDate: string,
  maxDate: string,
): T[] {
  if (data.length === 0) return data;
  let start = range.start;
  let end = range.end;

  if (range.preset !== "custom") {
    const max = parseDate(maxDate);
    const years =
      range.preset === "1Y" ? 1 : range.preset === "3Y" ? 3 : range.preset === "5Y" ? 5 : 0;
    if (years > 0) {
      const from = new Date(max);
      from.setUTCFullYear(from.getUTCFullYear() - years);
      start = from.toISOString().slice(0, 10);
    } else {
      start = minDate;
    }
    end = maxDate;
  }

  return data.filter((d) => {
    if (start && d.date < start) return false;
    if (end && d.date > end) return false;
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
