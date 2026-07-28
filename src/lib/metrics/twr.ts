import type { TwrPoint } from './types';
import { uniqueSortedDates } from './utils';

export interface DailyPortfolioFlow {
  date: string;
  securitiesValue: number;
  buysGbp: number;
  sellsGbp: number;
  dividendsGbp: number;
}

/**
 * Daily time-weighted return on securities value, chain-linked, skip V_{t-1}=0.
 * Indexed to 100 at the first day with positive value.
 */
export function computeTwr(daily: DailyPortfolioFlow[]): TwrPoint[] {
  const dates = uniqueSortedDates(daily.map((d) => d.date));
  const byDate = new Map(daily.map((d) => [d.date, d]));

  const points: TwrPoint[] = [];
  let index = 100;
  let prevValue = 0;
  let started = false;

  for (const date of dates) {
    const row = byDate.get(date);
    if (!row) continue;

    const V = row.securitiesValue;
    let dailyReturn = 0;

    if (prevValue > 0) {
      dailyReturn =
        (V + row.sellsGbp + row.dividendsGbp - row.buysGbp - prevValue) / prevValue;
      index *= 1 + dailyReturn;
      started = true;
    } else if (V > 0 && !started) {
      index = 100;
      started = true;
    }

    points.push({ date, index, dailyReturn });
    prevValue = V;
  }

  return points;
}
