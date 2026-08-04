"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { METRICS, type MetricId } from "@/lib/metrics/glossary";
import { FloatingBox } from "./FloatingBox";

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
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const tipId = useId();
  const outerRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const el = children ? outerRef.current : buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAnchor({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }, [open, children]);

  const showTip = useCallback(() => {
    setOpen(true);
  }, []);

  const toggleTip = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  return (
    <span ref={outerRef} className="inline-flex items-center">
      {children ?? (
        <button
          ref={buttonRef}
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] text-muted hover:text-ink-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          aria-label={`About ${label}`}
          aria-describedby={open ? tipId : undefined}
          aria-expanded={open}
          onClick={toggleTip}
          onMouseEnter={showTip}
          onMouseLeave={() => setOpen(false)}
          onFocus={showTip}
          onBlur={() => setOpen(false)}
        >
          ?
        </button>
      )}
      {open && anchor && (
        <FloatingBox
          id={tipId}
          role="tooltip"
          anchor={anchor}
          className="w-max max-w-[min(56rem,calc(100vw-2rem))] px-3 py-2 text-xs text-ink-secondary"
        >
          <span className="mb-1 block font-medium text-ink">{label}</span>
          {definition}
        </FloatingBox>
      )}
    </span>
  );
}
