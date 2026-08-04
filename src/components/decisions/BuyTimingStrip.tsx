"use client";

import { useMemo } from "react";
import { StripPlot, createLinearScale, useMeasuredWidth } from "@/components/charts";
import { formatDate } from "@/lib/format/numbers";
import type { BuyingStripPoint } from "@/lib/analysis/buyingTypes";

interface BuyTimingStripProps {
  strip: BuyingStripPoint[];
}

export function BuyTimingStrip({ strip }: BuyTimingStripProps) {
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
    if (points.length === 0) return [-2, 2] as [number, number];
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

  if (strip.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">No buys with a mature 1y window yet</p>;
  }

  return (
    <div ref={ref}>
      <StripPlot points={points} xScale={xScale} width={width} />
    </div>
  );
}
