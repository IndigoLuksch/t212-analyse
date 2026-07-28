import type { ReactNode } from "react";

interface StatChipProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function StatChip({ label, value, className = "" }: StatChipProps) {
  return (
    <div className={`inline-flex items-baseline gap-1.5 text-sm ${className}`}>
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
