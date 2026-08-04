"use client";

import { LinearLineChart } from "@/components/charts/LinearLineChart";
import { useChartSize } from "@/components/charts";
import type { BuyingCurvePoint } from "@/lib/analysis/buyingTypes";

interface PostBuyCurveChartProps {
  curve: BuyingCurvePoint[];
}

export function PostBuyCurveChart({ curve }: PostBuyCurveChartProps) {
  const { width, height } = useChartSize();

  if (curve.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No mature buy horizons yet</p>;
  }

  const points = curve
    .filter((p) => p.adj != null)
    .map((p) => ({
      x: p.horizonDays,
      y: p.adj!,
      n: p.n,
      label: p.label,
    }));

  const band = curve
    .filter((p) => p.iqrLo != null && p.iqrHi != null)
    .map((p) => ({
      x: p.horizonDays,
      lo: p.iqrLo!,
      hi: p.iqrHi!,
    }));

  return (
    <LinearLineChart
      points={points}
      width={width}
      height={height}
      band={band}
    />
  );
}
