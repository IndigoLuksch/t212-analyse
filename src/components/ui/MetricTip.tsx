"use client";

import { useState, type ReactNode } from "react";

interface MetricTipProps {
  label: string;
  definition: string;
  children?: ReactNode;
}

export function MetricTip({ label, definition, children }: MetricTipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children ?? (
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] text-muted hover:text-ink-secondary"
          aria-label={`About ${label}`}
        >
          ?
        </button>
      )}
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded border border-border bg-surface px-3 py-2 text-xs text-ink-secondary shadow-sm"
        >
          <span className="mb-1 block font-medium text-ink">{label}</span>
          {definition}
        </span>
      )}
    </span>
  );
}
