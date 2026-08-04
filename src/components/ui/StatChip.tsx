import type { ReactNode } from "react";
import { MetricTip } from "@/components/ui/MetricTip";
import type { MetricId } from "@/lib/metrics/glossary";

interface StatChipProps {
  label: string;
  value: ReactNode;
  metric?: MetricId;
  className?: string;
}

export function StatChip({ label, value, metric, className = "" }: StatChipProps) {
  return (
    <div className={`inline-flex items-baseline gap-1.5 text-sm ${className}`}>
      <span className="inline-flex items-center gap-1.5 text-muted">
        {label}
        {metric ? <MetricTip metric={metric} /> : null}
      </span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
