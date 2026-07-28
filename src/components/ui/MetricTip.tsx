"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { METRICS, type MetricId } from "@/lib/metrics/glossary";

type MetricTipProps =
  | { metric: MetricId; children?: ReactNode; label?: never; definition?: never }
  | { label: string; definition: string; children?: ReactNode; metric?: never };

export function MetricTip(props: MetricTipProps) {
  const label = props.metric ? METRICS[props.metric].label : props.label;
  const definition = props.metric
    ? METRICS[props.metric].definition
    : props.definition;
  const { children } = props;

  const [open, setOpen] = useState(false);
  const [flipDown, setFlipDown] = useState(false);
  const tipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const top = triggerRef.current.getBoundingClientRect().top;
    setFlipDown(top < 120);
  }, [open]);

  return (
    <span className="relative inline-flex items-center">
      {children ?? (
        <button
          ref={triggerRef}
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] text-muted hover:text-ink-secondary"
          aria-label={`About ${label}`}
          aria-describedby={open ? tipId : undefined}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        >
          ?
        </button>
      )}
      {open && (
        <span
          id={tipId}
          role="tooltip"
          className={`absolute left-1/2 z-20 max-w-[min(14rem,calc(100vw-2rem))] -translate-x-1/2 rounded border border-border bg-surface px-3 py-2 text-xs text-ink-secondary shadow-sm ${
            flipDown ? "top-full mt-2" : "bottom-full mb-2"
          }`}
        >
          <span className="mb-1 block font-medium text-ink">{label}</span>
          {definition}
        </span>
      )}
    </span>
  );
}
