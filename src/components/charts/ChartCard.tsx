"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MetricTip } from "@/components/ui/MetricTip";
import { TooltipLayer } from "./TooltipLayer";
import {
  ChartSizeContext,
  portfolioChartHeight,
  useMeasuredWidth,
} from "./useChartWidth";
import type { MetricId } from "@/lib/metrics/glossary";

/** Below this content width, flip to the table view when one exists. */
const MIN_CHART_WIDTH = 280;

/** Padding budget in fullscreen (`p-8` × 2) — used in the plot-height formula. */
const FULLSCREEN_PAD = 64;

const MUTED_BTN =
  "shrink-0 text-sm text-muted opacity-0 transition-opacity hover:text-ink-secondary focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100";

interface ChartCardProps {
  title: string;
  caption?: string;
  titleMetric?: MetricId;
  captionMetric?: MetricId;
  table?: ReactNode;
  stale?: boolean;
  children: ReactNode;
}

function supportsFullscreen(el: HTMLElement): boolean {
  return typeof el.requestFullscreen === "function";
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
  const [fullscreen, setFullscreen] = useState(false);
  const [nativeFs, setNativeFs] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [vh, setVh] = useState(800);

  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const nativeFsRef = useRef(false);
  const [plotRef, width] = useMeasuredWidth();

  const height = fullscreen
    ? Math.max(200, Math.round(vh - headerHeight - FULLSCREEN_PAD))
    : portfolioChartHeight(width);
  const tooNarrow = width > 0 && width < MIN_CHART_WIDTH;
  const showingTable = (tooNarrow && !!table) || showTable;

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => {
      const mb = parseFloat(getComputedStyle(el).marginBottom) || 0;
      setHeaderHeight(el.getBoundingClientRect().height + mb);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onChange = () => {
      const el = sectionRef.current;
      const active = !!el && document.fullscreenElement === el;
      if (active) {
        nativeFsRef.current = true;
        setNativeFs(true);
        setFullscreen(true);
      } else if (nativeFsRef.current) {
        // Escape / exitFullscreen — browser cleared document.fullscreenElement.
        nativeFsRef.current = false;
        setNativeFs(false);
        setFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const sync = () => setVh(window.innerHeight);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [fullscreen]);

  const toggleFullscreen = useCallback(async () => {
    const el = sectionRef.current;
    if (!el) return;

    if (document.fullscreenElement === el) {
      await document.exitFullscreen();
      return;
    }

    if (fullscreen && !document.fullscreenElement) {
      setFullscreen(false);
      return;
    }

    if (supportsFullscreen(el)) {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        // Fall through to overlay (denied / unavailable).
      }
    }

    setVh(window.innerHeight);
    setFullscreen(true);
  }, [fullscreen]);

  const overlayFallback = fullscreen && !nativeFs;

  return (
    <section
      ref={sectionRef}
      className={[
        "group relative transition-opacity",
        stale ? "opacity-60" : "",
        fullscreen
          ? "flex h-screen w-screen flex-col rounded-none border-0 bg-page p-8"
          : "rounded-lg border border-border bg-surface p-5",
        overlayFallback ? "fixed inset-0 z-50" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header
        ref={headerRef}
        className="mb-4 flex shrink-0 items-start justify-between gap-4"
      >
        <div className="min-w-0">
          {/* flex, not inline-flex: an inline-level h2 lets the caption run up
              against the title on the same line instead of sitting under it. */}
          <h2 className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-base font-medium text-ink">
            {title}
            {titleMetric ? <MetricTip metric={titleMetric} /> : null}
          </h2>
          {caption && (
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted">
              {caption}
              {captionMetric ? <MetricTip metric={captionMetric} /> : null}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {table && !tooNarrow && (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              className={MUTED_BTN}
            >
              {showTable ? "chart" : "table"}
            </button>
          )}
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={`${title}: full screen`}
            title="Full screen"
            className={MUTED_BTN}
          >
            {fullscreen ? "exit" : "expand"}
          </button>
        </div>
      </header>
      <div
        ref={plotRef}
        className={`w-full overflow-x-clip ${fullscreen ? "min-h-0 flex-1" : ""}`}
      >
        <ChartSizeContext.Provider value={{ width, height }}>
          <TooltipLayer>
            {showingTable && table ? (
              <div className="overflow-x-auto">{table}</div>
            ) : (
              children
            )}
          </TooltipLayer>
        </ChartSizeContext.Provider>
      </div>
    </section>
  );
}
