"use client";

import { MetricTip } from "@/components/ui/MetricTip";
import type { MetricId } from "@/lib/metrics/glossary";

interface SortHeaderProps<K extends string> {
  label: string;
  col: K;
  sortKey: K;
  sortAsc: boolean;
  onSort: (col: K) => void;
  metric?: MetricId;
}

/**
 * Sortable column header. Lives at module scope on purpose — each table used to
 * declare its own copy inside the component body, which remounts the button on
 * every render and drops its focus.
 */
export function SortHeader<K extends string>({
  label,
  col,
  sortKey,
  sortAsc,
  onSort,
  metric,
}: SortHeaderProps<K>) {
  const active = sortKey === col;
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${
          active ? "text-ink" : "text-muted"
        }`}
      >
        {label}
        {active ? (sortAsc ? " ↑" : " ↓") : ""}
      </button>
      {metric ? <MetricTip metric={metric} /> : null}
    </span>
  );
}
