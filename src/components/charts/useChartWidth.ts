"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export type ChartSize = { width: number; height: number };

/** Drawable size inside a ChartCard. null outside a card. */
export const ChartSizeContext = createContext<ChartSize | null>(null);

/** Portfolio card plot height from content width (W10.5). */
export function portfolioChartHeight(width: number): number {
  return Math.min(340, Math.max(200, Math.round(width * 0.42)));
}

/**
 * Measure an element's content box. useLayoutEffect so the first paint is correct;
 * skip setState when the change is &lt; 1px to avoid resize feedback loops.
 */
export function useMeasuredWidth(fallback = 640): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = (raw: number) => {
      if (!(raw > 0)) return;
      const next = Math.round(raw);
      setWidth((prev) => (Math.abs(prev - next) < 1 ? prev : next));
    };

    // Seed in case the observer's first callback is coalesced away.
    apply(el.getBoundingClientRect().width);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.contentBoxSize?.[0];
      apply(box ? box.inlineSize : entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}

/**
 * Inside a ChartCard: the drawable width from context.
 * Standalone: measures its own container (attach `ref` to a wrapper).
 */
export function useChartWidth(): { ref: RefObject<HTMLDivElement | null>; width: number } {
  const ctx = useContext(ChartSizeContext);
  const [ref, measured] = useMeasuredWidth();
  return { ref, width: ctx?.width ?? measured };
}

/**
 * Inside a ChartCard: width + derived plot height.
 * Standalone: measures own container and derives height the same way.
 */
export function useChartSize(): ChartSize & { ref: RefObject<HTMLDivElement | null> } {
  const ctx = useContext(ChartSizeContext);
  const [ref, measured] = useMeasuredWidth();
  if (ctx) return { ...ctx, ref };
  return { ref, width: measured, height: portfolioChartHeight(measured) };
}
