"use client";

import { useMemo } from "react";
import { StripPlot, createLinearScale, useMeasuredWidth } from "@/components/charts";
import { formatDate } from "@/lib/format/numbers";

interface SellTimingStripProps {
  strip: { id: string; ticker: string; name: string; date: string; value: number }[];
}

export function SellTimingStrip({ strip }: SellTimingStripProps) {
  const [ref, width] = useMeasuredWidth();

  const points = useMemo(
    () =>
      strip.map((p) => ({
        id: p.id,
        name: p.name,
        value: p.value * 100,
        detail: `${formatDate(p.date)} · ${p.ticker}`,
      })),
    [strip],
  );

  const domain = useMemo(() => {
    const vals = points.map((p) => p.value);
    const pad = 2;
    const lo = Math.min(...vals, 0) - pad;
    const hi = Math.max(...vals, 0) + pad;
    return [lo, hi] as [number, number];
  }, [points]);

  const xScale = useMemo(
    () => createLinearScale(domain, [48, width - 48]),
    [domain, width],
  );

  return (
    <div ref={ref}>
      <StripPlot points={points} xScale={xScale} width={width} />
    </div>
  );
}
