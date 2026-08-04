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
 *
 * The denominator is the capital actually exposed to the market that day:
 * the opening value plus anything paid in. Money in and money out are treated
 * differently on purpose — a contribution is put to work during the day and
 * earns part of that day's move, while a withdrawal was exposed right up to the
 * moment it left.
 *
 * Dividing by the opening value alone is what naive daily TWR does, and it
 * breaks whenever a contribution is large relative to the balance it lands on:
 * the new money earns the day's move but the denominator pretends it was not
 * there. A pie opening at £8.66 that takes a £75 contribution and gains £0.45
 * reads as +5.2% for the day on that basis, against +0.07% for its benchmark —
 * an artefact of the contribution, not performance. Counting it gives +0.54%.
 *
 * Subtracting withdrawals would be the symmetric-looking choice and is wrong:
 * on the day a position is fully sold the exposed capital would be zero, the
 * numerator would collapse to exactly minus the denominator, and a −100% day
 * would zero the chain-linked index forever — even though the holding was
 * simply closed and later rebought.
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
      // Dividends are internal income, not an external flow, so they lift the
      // numerator without changing the capital base.
      const exposed = prevValue + row.buysGbp;
      if (exposed > 0) {
        dailyReturn =
          (V + row.sellsGbp + row.dividendsGbp - row.buysGbp - prevValue) / exposed;
        index *= 1 + dailyReturn;
      }
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
