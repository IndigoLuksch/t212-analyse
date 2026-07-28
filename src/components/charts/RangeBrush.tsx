"use client";

import { area } from "d3-shape";
import { useId, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { CHART_MARKS } from "./constants";
import type { DatePoint } from "./types";

interface RangeBrushProps {
  width: number;
  /** Full extent of available data. */
  domain: [Date, Date];
  /** Current selection. */
  value: [Date, Date];
  onChange: (next: [Date, Date]) => void;
  /** Faint context sparkline drawn behind the track — portfolio value / stock close. */
  context?: DatePoint[];
  height?: number;
}

type DragMode = "start" | "end" | "pan";

const DAY_MS = 86_400_000;
const MIN_POINTS = 10;
const HANDLE_W = 3;
const HIT_W = CHART_MARKS.hitTargetMin;

export function RangeBrush({
  width,
  domain,
  value,
  onChange,
  context,
  height = 36,
}: RangeBrushProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ mode: DragMode; grabMs: number } | null>(null);
  const clipId = useId();

  const t0 = domain[0].getTime();
  const t1 = domain[1].getTime();
  const span = Math.max(t1 - t0, DAY_MS);
  const plotW = Math.max(width, 1);

  const toX = (ms: number) => ((ms - t0) / span) * plotW;
  const toMs = (x: number) => t0 + (Math.min(Math.max(x, 0), plotW) / plotW) * span;

  /** Never let the window fall below ten context points, so the chart cannot go empty. */
  const minSpan = useMemo(() => {
    const n = context?.length ?? 0;
    const step =
      n > 1
        ? (context![n - 1]!.date.getTime() - context![0]!.date.getTime()) / (n - 1)
        : DAY_MS;
    return Math.min(Math.max(step, DAY_MS) * MIN_POINTS, span);
  }, [context, span]);

  const contextPath = useMemo(() => {
    if (!context || context.length < 2) return "";
    let lo = Infinity;
    let hi = -Infinity;
    for (const d of context) {
      if (!Number.isFinite(d.value)) continue;
      if (d.value < lo) lo = d.value;
      if (d.value > hi) hi = d.value;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return "";
    const top = 3;
    const bottom = height - 1;
    const yOf = (v: number) =>
      hi === lo ? bottom : bottom - ((v - lo) / (hi - lo)) * (bottom - top);
    const gen = area<DatePoint>()
      .x((d) => ((d.date.getTime() - t0) / span) * plotW)
      .y0(height)
      .y1((d) => yOf(d.value))
      .defined((d) => Number.isFinite(d.value));
    return gen(context) ?? "";
  }, [context, height, t0, span, plotW]);

  const v0 = value[0].getTime();
  const v1 = value[1].getTime();
  const x0 = toX(v0);
  const x1 = toX(v1);

  const commit = (startMs: number, endMs: number) => {
    onChange([new Date(Math.round(startMs)), new Date(Math.round(endMs))]);
  };

  const moveStart = (ms: number) => {
    commit(Math.max(t0, Math.min(ms, v1 - minSpan)), v1);
  };

  const moveEnd = (ms: number) => {
    commit(v0, Math.min(t1, Math.max(ms, v0 + minSpan)));
  };

  const pan = (startMs: number) => {
    const windowSpan = v1 - v0;
    const next = Math.min(Math.max(startMs, t0), t1 - windowSpan);
    commit(next, next + windowSpan);
  };

  const pointerMs = (e: PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return v0;
    return toMs(e.clientX - rect.left);
  };

  const beginDrag = (e: PointerEvent, mode: DragMode, grabMs = 0) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { mode, grabMs };
  };

  const beginHandleDrag = (e: PointerEvent<SVGRectElement>, mode: "start" | "end") => {
    e.currentTarget.focus();
    beginDrag(e, mode);
  };

  const onTrackDown = (e: PointerEvent) => {
    const ms = pointerMs(e);
    const windowSpan = v1 - v0;
    const start = Math.min(Math.max(ms - windowSpan / 2, t0), t1 - windowSpan);
    beginDrag(e, "pan", ms - start);
    commit(start, start + windowSpan);
  };

  const onPointerMove = (e: PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const ms = pointerMs(e);
    if (state.mode === "start") moveStart(ms);
    else if (state.mode === "end") moveEnd(ms);
    else pan(ms - state.grabMs);
  };

  const endDrag = (e: PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    svgRef.current?.releasePointerCapture(e.pointerId);
  };

  const onHandleKeyDown = (e: KeyboardEvent, which: "start" | "end") => {
    const current = which === "start" ? v0 : v1;
    let next: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      if (e.shiftKey) {
        const d = new Date(current);
        d.setUTCMonth(d.getUTCMonth() + dir);
        next = d.getTime();
      } else {
        next = current + dir * DAY_MS;
      }
    } else if (e.key === "Home") {
      next = t0;
    } else if (e.key === "End") {
      next = t1;
    }
    if (next == null) return;
    e.preventDefault();
    if (which === "start") moveStart(next);
    else moveEnd(next);
  };

  if (width <= 0) return null;

  const handleX = (x: number) => Math.min(Math.max(x - HANDLE_W / 2, 0), plotW - HANDLE_W);
  const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="touch-none select-none"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <rect
        x={0}
        y={0}
        width={plotW}
        height={height}
        fill="transparent"
        style={{ cursor: "pointer" }}
        onPointerDown={onTrackDown}
      />
      {contextPath && (
        <>
          <path d={contextPath} fill="var(--muted)" opacity={CHART_MARKS.fadedOpacity} />
          <clipPath id={clipId}>
            <rect x={x0} y={0} width={Math.max(x1 - x0, 0)} height={height} />
          </clipPath>
          <path d={contextPath} fill="var(--muted)" clipPath={`url(#${clipId})`} />
        </>
      )}
      <rect x={0} y={0} width={Math.max(x0, 0)} height={height} fill="var(--gridline)" opacity={0.6} />
      <rect
        x={x1}
        y={0}
        width={Math.max(plotW - x1, 0)}
        height={height}
        fill="var(--gridline)"
        opacity={0.6}
      />
      <line
        x1={0}
        x2={plotW}
        y1={height - 0.5}
        y2={height - 0.5}
        stroke="var(--baseline)"
        shapeRendering="crispEdges"
      />
      <rect
        x={x0}
        y={0}
        width={Math.max(x1 - x0, 0)}
        height={height}
        fill="transparent"
        style={{ cursor: "grab" }}
        onPointerDown={(e) => beginDrag(e, "pan", pointerMs(e) - v0)}
      />
      <rect x={handleX(x0)} y={0} width={HANDLE_W} height={height} fill="var(--baseline)" />
      <rect x={handleX(x1)} y={0} width={HANDLE_W} height={height} fill="var(--baseline)" />
      <rect
        x={x0 - HIT_W / 2}
        y={0}
        width={HIT_W}
        height={height}
        fill="transparent"
        style={{ cursor: "ew-resize" }}
        tabIndex={0}
        role="slider"
        aria-label="Range start"
        aria-valuemin={t0}
        aria-valuemax={t1}
        aria-valuenow={v0}
        aria-valuetext={isoOf(v0)}
        onPointerDown={(e) => beginHandleDrag(e, "start")}
        onKeyDown={(e) => onHandleKeyDown(e, "start")}
      />
      <rect
        x={x1 - HIT_W / 2}
        y={0}
        width={HIT_W}
        height={height}
        fill="transparent"
        style={{ cursor: "ew-resize" }}
        tabIndex={0}
        role="slider"
        aria-label="Range end"
        aria-valuemin={t0}
        aria-valuemax={t1}
        aria-valuenow={v1}
        aria-valuetext={isoOf(v1)}
        onPointerDown={(e) => beginHandleDrag(e, "end")}
        onKeyDown={(e) => onHandleKeyDown(e, "end")}
      />
    </svg>
  );
}
