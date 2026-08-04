import type { ReactNode } from "react";
import { MetricTip } from "@/components/ui/MetricTip";
import type { MetricId } from "@/lib/metrics/glossary";

interface StatTileProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  metric?: MetricId;
  className?: string;
}

export function StatTile({
  label,
  value,
  sub,
  metric,
  className = "",
}: StatTileProps) {
  return (
    <div className={`rounded-lg border border-border bg-surface px-4 py-3 ${className}`}>
      <div className="inline-flex items-center gap-1.5 text-sm text-muted">
        {label}
        {metric ? <MetricTip metric={metric} /> : null}
      </div>
      <div className="mt-1 text-2xl font-medium text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-sm text-ink-secondary">{sub}</div>}
    </div>
  );
}
