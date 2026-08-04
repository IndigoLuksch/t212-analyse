import type { EntryContext, EntryContextDimension } from "@/lib/metrics/entryContext";

/** One row in the portfolio-wide buy-events table (`BuyTable`). */
export interface BuyRow {
  ticker: string;
  name: string;
  colorSlot: number | null;
  date: string;
  capitalGbp: number;
  classification: "base" | "up" | "down";
  entryContext: EntryContext;
  /** Index-adjusted cumulative return by horizon (days → fraction, or null if immature). */
  adjByHorizon: Record<number, number | null>;
  /** Convenience headline — adj at 365d when matured. */
  adj365: number | null;
  note: string;
  orderId: string;
}

/** Per-buy row on the stock detail page (`BuysSection`). */
export interface StockBuyRow {
  date: string;
  capitalGbp: number;
  classification: "base" | "up" | "down";
  entryContext: EntryContext;
  adj90: number | null;
  adj182: number | null;
  adj365: number | null;
  orderId: string;
}

export interface BuyingCurvePoint {
  horizonDays: number;
  label: string;
  /** Capital-weighted mean index-adjusted return (fraction). */
  adj: number | null;
  median: number | null;
  iqrLo: number | null;
  iqrHi: number | null;
  n: number;
  capitalGbp: number;
}

export interface ContextBucketRow {
  dimension: EntryContextDimension;
  dimensionLabel: string;
  bucketId: string;
  bucketLabel: string;
  /** Capital-weighted adj at 365d (fraction). */
  adj365: number | null;
  n: number;
  capitalGbp: number;
}

export interface BuyingKpis {
  medianBuyDiscipline: number | null;
  averagingUp: { return: number | null; n: number };
  averagingDown: { return: number | null; n: number };
  /** Capital-weighted mean adj return at 365d (fraction). */
  adj365: number | null;
}

export interface BuyingStripPoint {
  id: string;
  ticker: string;
  name: string;
  date: string;
  /** Index-adjusted return at 365d (fraction). */
  value: number;
  colorSlot: number | null;
}

/** Return shape for `computeBuying()` — see PLAN W13 §B5. */
export interface BuyingResult {
  asOf: string;
  kpis: BuyingKpis;
  curve: BuyingCurvePoint[];
  buyRows: BuyRow[];
  contextBuckets: ContextBucketRow[];
  strip: BuyingStripPoint[];
}
