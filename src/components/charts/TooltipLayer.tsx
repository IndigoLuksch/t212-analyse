"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FloatingBox } from "@/components/ui/FloatingBox";
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
  /** Client/viewport coordinates passed to the portalled floating box. */
  show: (clientX: number, clientY: number, payload: TooltipPayload) => void;
  hide: () => void;
}

interface TooltipState {
  x: number;
  y: number;
  payload: TooltipPayload;
}

const NOOP: TooltipApi = { show: () => {}, hide: () => {} };

const TooltipContext = createContext<TooltipApi | null>(null);

export function TooltipLayer({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TooltipState | null>(null);
  const pendingRef = useRef<{ clientX: number; clientY: number; payload: TooltipPayload } | null>(
    null,
  );
  const frameRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    setState({
      x: pending.clientX,
      y: pending.clientY,
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

  return (
    <TooltipContext.Provider value={api}>
      <div className="relative">
        {children}
        {state && (
          <FloatingBox
            anchor={{ x: state.x, y: state.y }}
            className="px-3 py-2"
            style={{ fontSize: 12, maxWidth: "15rem" }}
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
          </FloatingBox>
        )}
      </div>
    </TooltipContext.Provider>
  );
}

/** No-op when there is no provider, so primitives stay usable standalone. */
export function useTooltip(): TooltipApi {
  return useContext(TooltipContext) ?? NOOP;
}
