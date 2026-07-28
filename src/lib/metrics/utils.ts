import type { FxRate, PriceBar } from './types';

const MS_PER_DAY = 86_400_000;

/** UTC calendar date (YYYY-MM-DD) from an ISO timestamp. */
export function toUtcDate(iso: string): string {
  return iso.slice(0, 10);
}

export function parseDate(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function daysBetween(from: string, to: string): number {
  return (parseDate(to) - parseDate(from)) / MS_PER_DAY;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function sortByDate<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.date.localeCompare(b.date));
}

export function sortOrdersByExecution<T extends { executedAt: string }>(orders: T[]): T[] {
  return [...orders].sort((a, b) => a.executedAt.localeCompare(b.executedAt));
}

/**
 * These lookups run once per calendar date per instrument, so a naive
 * filter+sort per call is O(n^2 log n) over a decade of daily bars — it made the
 * portfolio page take ~54s. Sort each input array once (cached by array
 * identity, which is stable within a computation) and binary search it.
 */
const sortedPriceCache = new WeakMap<PriceBar[], PriceBar[]>();
const fxByCcyCache = new WeakMap<FxRate[], Map<string, FxRate[]>>();
const sortedDatesCache = new WeakMap<string[], string[]>();

/** Index of the last item dated on or before `date`, or -1. */
function lastIndexOnOrBefore<T extends { date: string }>(sorted: T[], date: string): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]!.date <= date) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Last known rate on or before `date` for `ccy`. */
export function fxOnDate(fxRates: FxRate[], date: string, ccy: string): number {
  if (ccy === 'GBP') return 1;

  let byCcy = fxByCcyCache.get(fxRates);
  if (!byCcy) {
    byCcy = new Map<string, FxRate[]>();
    for (const r of fxRates) {
      const list = byCcy.get(r.ccy);
      if (list) list.push(r);
      else byCcy.set(r.ccy, [r]);
    }
    for (const [key, list] of byCcy) byCcy.set(key, sortByDate(list));
    fxByCcyCache.set(fxRates, byCcy);
  }

  const sorted = byCcy.get(ccy) ?? [];
  const idx = lastIndexOnOrBefore(sorted, date);
  if (idx === -1) {
    throw new Error(`No FX rate for ${ccy} on or before ${date}`);
  }
  return sorted[idx]!.gbpPerUnit;
}

/** Close on or before `date`; throws if none. */
export function closeOnDate(prices: PriceBar[], date: string): number {
  let sorted = sortedPriceCache.get(prices);
  if (!sorted) {
    sorted = sortByDate(prices);
    sortedPriceCache.set(prices, sorted);
  }

  const idx = lastIndexOnOrBefore(sorted, date);
  if (idx === -1) {
    throw new Error(`No price on or before ${date}`);
  }
  return sorted[idx]!.closeLocal;
}

/** Trading-day offset: the Nth trading day on or after `fromDate` (0 = fromDate itself if it is a trading day). */
export function tradingDayOffset(
  fromDate: string,
  offset: number,
  tradingDates: string[],
): string | null {
  let sorted = sortedDatesCache.get(tradingDates);
  if (!sorted) {
    sorted = [...tradingDates].sort();
    sortedDatesCache.set(tradingDates, sorted);
  }

  // First index dated >= fromDate, by binary search.
  let lo = 0;
  let hi = sorted.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! >= fromDate) {
      idx = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  if (idx === -1) return null;

  const target = idx + offset;
  return target < sorted.length ? sorted[target]! : null;
}

export function uniqueSortedDates(dates: string[]): string[] {
  return [...new Set(dates)].sort();
}

export function dustThreshold(episodePeak: number): number {
  return Math.max(1e-6, 1e-4 * episodePeak);
}

export function applyDust(shares: number, episodePeak: number): number {
  return Math.abs(shares) < dustThreshold(episodePeak) ? 0 : shares;
}
