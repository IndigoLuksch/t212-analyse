"use client";

import { useMemo } from "react";
import { DivergingBars, useMeasuredWidth } from "@/components/charts";
import { formatTooltipPct } from "@/components/charts/format";
import type { ContextBucketRow } from "@/lib/analysis/buyingTypes";
import { ENTRY_CONTEXT_DIMENSIONS } from "@/lib/metrics/entryContext";

interface EntryContextChartProps {
  buckets: ContextBucketRow[];
}

export function EntryContextChart({ buckets }: EntryContextChartProps) {
  const [ref, width] = useMeasuredWidth();

  const byDimension = useMemo(() => {
    const map = new Map<string, ContextBucketRow[]>();
    for (const dim of ENTRY_CONTEXT_DIMENSIONS) {
      map.set(
        dim.key,
        buckets.filter((b) => b.dimension === dim.key && b.n > 0),
      );
    }
    return map;
  }, [buckets]);

  const hasData = [...byDimension.values()].some((rows) => rows.length > 0);

  if (!hasData) {
    return <p className="py-8 text-center text-sm text-muted">No entry-context data yet</p>;
  }

  return (
    <div ref={ref} className="space-y-8">
      {ENTRY_CONTEXT_DIMENSIONS.map((dim) => {
        const rows = byDimension.get(dim.key) ?? [];
        if (rows.length === 0) return null;
        const data = rows
          .filter((b) => b.adj365 != null)
          .map((b) => ({
            id: b.bucketId,
            name: `${b.bucketLabel} (n=${b.n})`,
            value: b.adj365!,
          }));
        if (data.length === 0) return null;
        return (
          <div key={dim.key}>
            <h3 className="mb-3 text-sm font-medium text-ink">{dim.label}</h3>
            <DivergingBars
              data={data}
              width={width}
              formatValue={(n) => formatTooltipPct(n, true)}
            />
          </div>
        );
      })}
    </div>
  );
}
