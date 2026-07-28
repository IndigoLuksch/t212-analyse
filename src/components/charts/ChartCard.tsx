"use client";

import { useState, type ReactNode } from "react";
import { MetricTip } from "@/components/ui/MetricTip";
import { TooltipLayer } from "./TooltipLayer";
import type { MetricId } from "@/lib/metrics/glossary";

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
        {table && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="shrink-0 text-sm text-muted opacity-0 transition-opacity hover:text-ink-secondary focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {showTable ? "chart" : "table"}
          </button>
        )}
      </header>
      <TooltipLayer>
        {showTable && table ? <div className="overflow-x-auto">{table}</div> : children}
      </TooltipLayer>
    </section>
  );
}
