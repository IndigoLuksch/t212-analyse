import type { ReactNode } from "react";

interface StatTileProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
}

export function StatTile({ label, value, sub, className = "" }: StatTileProps) {
  return (
    <div className={`rounded-lg border border-border bg-surface px-4 py-3 ${className}`}>
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-medium text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-sm text-ink-secondary">{sub}</div>}
    </div>
  );
}
