"use client";

import { useState, type ReactNode } from "react";
import { MetricTip } from "@/components/ui/MetricTip";
import { TooltipLayer } from "./TooltipLayer";
import {
  ChartSizeContext,
  portfolioChartHeight,
  useMeasuredWidth,
} from "./useChartWidth";
import type { MetricId } from "@/lib/metrics/glossary";

/** Below this content width, flip to the table view when one exists. */
const MIN_CHART_WIDTH = 280;

interface ChartCardProps {
  title: string;
  caption?: string;
  titleMetric?: MetricId;
  captionMetric?: MetricId;
  table?: ReactNode;
  stale?: boolean;
  children: ReactNode;
}

export function ChartCard({
  title,
  caption,
  titleMetric,
  captionMetric,
  table,
  stale = false,
  children,
}: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);
  const [plotRef, width] = useMeasuredWidth();
  const height = portfolioChartHeight(width);
  const tooNarrow = width > 0 && width < MIN_CHART_WIDTH;
  const showingTable = (tooNarrow && !!table) || showTable;

  return (
    <section
      className={`group relative rounded-lg border border-border bg-surface p-5 transition-opacity ${
        stale ? "opacity-60" : ""
      }`}
    >
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="inline-flex items-center gap-1 text-base font-medium text-ink">
            {title}
            {titleMetric ? <MetricTip metric={titleMetric} /> : null}
          </h2>
          {caption && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted">
              {caption}
              {captionMetric ? <MetricTip metric={captionMetric} /> : null}
            </p>
          )}
        </div>
        {table && !tooNarrow && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="shrink-0 text-sm text-muted opacity-0 transition-opacity hover:text-ink-secondary focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {showTable ? "chart" : "table"}
          </button>
        )}
      </header>
      <div ref={plotRef} className="w-full overflow-x-clip">
        <ChartSizeContext.Provider value={{ width, height }}>
          <TooltipLayer>
            {showingTable && table ? (
              <div className="overflow-x-auto">{table}</div>
            ) : (
              children
            )}
          </TooltipLayer>
        </ChartSizeContext.Provider>
      </div>
    </section>
  );
}
