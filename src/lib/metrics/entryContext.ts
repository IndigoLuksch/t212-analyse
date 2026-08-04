import type { PriceBar } from './types';

export interface EntryContext {
  /** (close − 52w high) / high; negative = below the high. */
  pctFrom52wHigh: number | null;
  trailing3mReturn: number | null;
  pctFrom200dma: number | null;
}

export interface ContextBucketDef {
  id: string;
  label: string;
  /** Inclusive lower bound; null = −∞. */
  lo: number | null;
  /** Exclusive upper bound; null = +∞. */
  hi: number | null;
}

/**
 * Fixed edges for pctFrom52wHigh (fractions). Quantile edges would shift on
 * every sync; these do not.
 */
export const PCT_FROM_52W_HIGH_BUCKETS: readonly ContextBucketDef[] = [
  { id: '0_to_-10', label: '0 to −10%', lo: -0.1, hi: 0 },
  { id: '-10_to_-25', label: '−10 to −25%', lo: -0.25, hi: -0.1 },
  { id: '-25_to_-40', label: '−25 to −40%', lo: -0.4, hi: -0.25 },
  { id: 'below_-40', label: '< −40%', lo: null, hi: -0.4 },
] as const;

/** Fixed edges for trailing 3-month return. */
export const TRAILING_3M_BUCKETS: readonly ContextBucketDef[] = [
  { id: 'above_10', label: '> +10%', lo: 0.1, hi: null },
  { id: '0_to_10', label: '0 to +10%', lo: 0, hi: 0.1 },
  { id: '-10_to_0', label: '−10 to 0%', lo: -0.1, hi: 0 },
  { id: 'below_-10', label: '< −10%', lo: null, hi: -0.1 },
] as const;

/** Fixed edges for distance from the 200-day average. */
export const PCT_FROM_200DMA_BUCKETS: readonly ContextBucketDef[] = [
  { id: 'above_10', label: '> +10% vs 200dma', lo: 0.1, hi: null },
  { id: '0_to_10', label: '0 to +10%', lo: 0, hi: 0.1 },
  { id: '-10_to_0', label: '−10 to 0%', lo: -0.1, hi: 0 },
  { id: 'below_-10', label: '< −10% vs 200dma', lo: null, hi: -0.1 },
] as const;

export type EntryContextDimension = 'pctFrom52wHigh' | 'trailing3mReturn' | 'pctFrom200dma';

export const ENTRY_CONTEXT_DIMENSIONS: {
  key: EntryContextDimension;
  label: string;
  buckets: readonly ContextBucketDef[];
}[] = [
  { key: 'pctFrom52wHigh', label: '% from 52-week high', buckets: PCT_FROM_52W_HIGH_BUCKETS },
  { key: 'trailing3mReturn', label: 'Trailing 3-month return', buckets: TRAILING_3M_BUCKETS },
  { key: 'pctFrom200dma', label: '% from 200-day average', buckets: PCT_FROM_200DMA_BUCKETS },
];

export function bucketValue(
  value: number | null,
  buckets: readonly ContextBucketDef[],
): ContextBucketDef | null {
  if (value == null) return null;
  for (const b of buckets) {
    const aboveLo = b.lo == null || value >= b.lo;
    const belowHi = b.hi == null || value < b.hi;
    if (aboveLo && belowHi) return b;
  }
  return null;
}

/**
 * Market context on the day *before* a buy. Strictly no look-ahead: only bars
 * with `bar.date < date` participate.
 */
export function computeEntryContext(date: string, prices: PriceBar[]): EntryContext {
  const prior = prices.filter((p) => p.date < date);
  if (prior.length === 0) {
    return { pctFrom52wHigh: null, trailing3mReturn: null, pctFrom200dma: null };
  }

  const closeNow = prior[prior.length - 1]!.closeLocal;

  let pctFrom52wHigh: number | null = null;
  if (prior.length >= 252) {
    const window = prior.slice(-252);
    let high = -Infinity;
    for (const b of window) {
      if (b.closeLocal > high) high = b.closeLocal;
    }
    if (high > 0) pctFrom52wHigh = (closeNow - high) / high;
  }

  let trailing3mReturn: number | null = null;
  if (prior.length >= 63) {
    const closeThen = prior[prior.length - 63]!.closeLocal;
    if (closeThen > 0) trailing3mReturn = (closeNow - closeThen) / closeThen;
  }

  let pctFrom200dma: number | null = null;
  if (prior.length >= 200) {
    const window = prior.slice(-200);
    let sum = 0;
    for (const b of window) sum += b.closeLocal;
    const sma = sum / 200;
    if (sma > 0) pctFrom200dma = (closeNow - sma) / sma;
  }

  return { pctFrom52wHigh, trailing3mReturn, pctFrom200dma };
}
