import type { AllocationDay } from './types';
import { uniqueSortedDates } from './utils';

export interface DailyMarketValue {
  date: string;
  ticker: string;
  marketValueGbp: number;
}

/** Daily weights and top-3 concentration (securities only). */
export function computeAllocation(daily: DailyMarketValue[]): AllocationDay[] {
  const dates = uniqueSortedDates(daily.map((d) => d.date));
  const byDate = new Map<string, DailyMarketValue[]>();

  for (const row of daily) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }

  return dates.map((date) => {
    const rows = byDate.get(date) ?? [];
    const total = rows.reduce((s, r) => s + r.marketValueGbp, 0);
    const weights: Record<string, number> = {};

    for (const r of rows) {
      weights[r.ticker] = total > 0 ? r.marketValueGbp / total : 0;
    }

    const sortedWeights = Object.values(weights).sort((a, b) => b - a);
    const top3Concentration = sortedWeights.slice(0, 3).reduce((s, w) => s + w, 0);

    return { date, weights, top3Concentration };
  });
}
