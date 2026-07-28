"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TooltipEntry } from "./types";

interface SeriesRegistration {
  panelId: string;
  getEntries: (date: Date) => TooltipEntry[];
}

interface CrosshairState {
  /** Plot-space x of the snapped date, or null when the pointer is away. */
  x: number | null;
}

interface CrosshairContextValue extends CrosshairState {
  registerSeries: (id: string, panelId: string, getEntries: (date: Date) => TooltipEntry[]) => void;
  unregisterSeries: (id: string) => void;
  /** Returns the entries at that date, so the caller can build a tooltip without waiting a render. */
  handlePointer: (x: number, date: Date) => TooltipEntry[];
  clearPointer: () => void;
}

const CrosshairContext = createContext<CrosshairContextValue | null>(null);

export function CrosshairProvider({ children }: { children: ReactNode }) {
  const seriesRef = useRef<Map<string, SeriesRegistration>>(new Map());
  const [state, setState] = useState<CrosshairState>({ x: null });

  const collectEntries = useCallback((date: Date): TooltipEntry[] => {
    const entries: TooltipEntry[] = [];
    for (const reg of seriesRef.current.values()) {
      entries.push(...reg.getEntries(date));
    }
    return entries;
  }, []);

  const registerSeries = useCallback(
    (id: string, panelId: string, getEntries: (date: Date) => TooltipEntry[]) => {
      seriesRef.current.set(id, { panelId, getEntries });
    },
    [],
  );

  const unregisterSeries = useCallback((id: string) => {
    seriesRef.current.delete(id);
  }, []);

  const handlePointer = useCallback(
    (x: number, date: Date) => {
      setState({ x });
      return collectEntries(date);
    },
    [collectEntries],
  );

  const clearPointer = useCallback(() => {
    setState({ x: null });
  }, []);

  const value = useMemo(
    () => ({ ...state, registerSeries, unregisterSeries, handlePointer, clearPointer }),
    [state, registerSeries, unregisterSeries, handlePointer, clearPointer],
  );

  return <CrosshairContext.Provider value={value}>{children}</CrosshairContext.Provider>;
}

export function useCrosshair() {
  const ctx = useContext(CrosshairContext);
  if (!ctx) throw new Error("useCrosshair must be used within CrosshairProvider");
  return ctx;
}

export function useCrosshairOptional() {
  return useContext(CrosshairContext);
}
