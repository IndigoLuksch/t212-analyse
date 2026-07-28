"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TABULAR_CLASS } from "./format";

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

export interface TooltipPayload {
  title?: string;
  rows: TooltipRow[];
  footer?: string;
}

interface TooltipApi {
  /** Client coordinates — the layer converts against its own rect. */
  show: (clientX: number, clientY: number, payload: TooltipPayload) => void;
  hide: () => void;
}

interface TooltipState {
  x: number;
  y: number;
  payload: TooltipPayload;
}

/** Gap between the pointer and the tooltip box, and the edge it flips at. */
const GAP = 12;

const NOOP: TooltipApi = { show: () => {}, hide: () => {} };

const TooltipContext = createContext<TooltipApi | null>(null);

export function TooltipLayer({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<TooltipState | null>(null);
  const pendingRef = useRef<{ clientX: number; clientY: number; payload: TooltipPayload } | null>(
    null,
  );
  const frameRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    const pending = pendingRef.current;
    const wrapper = wrapperRef.current;
    if (!pending || !wrapper) return;
    pendingRef.current = null;
    const rect = wrapper.getBoundingClientRect();
    setState({
      x: pending.clientX - rect.left,
      y: pending.clientY - rect.top,
      payload: pending.payload,
    });
  }, []);

  const api = useMemo<TooltipApi>(
    () => ({
      show: (clientX, clientY, payload) => {
        pendingRef.current = { clientX, clientY, payload };
        if (frameRef.current == null) frameRef.current = requestAnimationFrame(flush);
      },
      hide: () => {
        pendingRef.current = null;
        if (frameRef.current != null) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        setState(null);
      },
    }),
    [flush],
  );

  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  // Measure the rendered box, then place it: flip away from whichever edge it
  // would cross and clamp inside the wrapper, so it can never be clipped.
  // Written to the node rather than to state — this runs before paint and one
  // pointer move should cost one render, not two.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const tip = tipRef.current;
    if (!state || !wrapper || !tip) return;
    const rect = wrapper.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const rawLeft = state.x + w + GAP > rect.width ? state.x - GAP - w : state.x + GAP;
    const rawTop = state.y + h + GAP > rect.height ? state.y - GAP - h : state.y + GAP;
    const left = Math.min(Math.max(rawLeft, 0), Math.max(0, rect.width - w));
    const top = Math.min(Math.max(rawTop, 0), Math.max(0, rect.height - h));
    tip.style.transform = `translate(${left}px, ${top}px)`;
  }, [state]);

  return (
    <TooltipContext.Provider value={api}>
      <div ref={wrapperRef} className="relative">
        {children}
        {state && (
          <div
            ref={tipRef}
            className="pointer-events-none absolute left-0 top-0 z-20 rounded border border-border bg-surface px-3 py-2"
            style={{
              fontSize: 12,
              maxWidth: "15rem",
              boxShadow: "0 1px 2px var(--border)",
            }}
          >
            {state.payload.title && (
              <div className={`mb-1.5 text-muted ${TABULAR_CLASS}`}>{state.payload.title}</div>
            )}
            {state.payload.rows.map((row, i) => (
              <div key={`${row.label}-${i}`} className="flex items-start gap-2 py-0.5">
                {row.color && (
                  <span
                    className="mt-1.5 inline-block h-0.5 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className={`font-semibold text-ink ${TABULAR_CLASS}`}>{row.value}</div>
                  <div className="truncate text-muted">{row.label}</div>
                </div>
              </div>
            ))}
            {state.payload.footer && (
              <div className="mt-1.5 text-muted">{state.payload.footer}</div>
            )}
          </div>
        )}
      </div>
    </TooltipContext.Provider>
  );
}

/** No-op when there is no provider, so primitives stay usable standalone. */
export function useTooltip(): TooltipApi {
  return useContext(TooltipContext) ?? NOOP;
}
