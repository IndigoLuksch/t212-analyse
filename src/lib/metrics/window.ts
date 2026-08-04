import type { DivEvent, FxRate, PriceBar } from './types';
import { closeOnDate, fxOnDate } from './utils';

/**
 * GBP total return of `shares` from `fromDate` to `toDate`, including
 * dividends paid in the open interval (from, to].
 */
export function gbpTotalReturn(
  fromDate: string,
  toDate: string,
  prices: PriceBar[],
  dividends: DivEvent[],
  fxRates: FxRate[],
  currency: string,
  shares: number,
): number {
  const fx0 = fxOnDate(fxRates, fromDate, currency);
  const fx1 = fxOnDate(fxRates, toDate, currency);
  const p0 = closeOnDate(prices, fromDate);
  const p1 = closeOnDate(prices, toDate);

  const startValue = shares * p0 * fx0;
  const endValue = shares * p1 * fx1;

  let divGbp = 0;
  for (const d of dividends) {
    if (d.date > fromDate && d.date <= toDate) {
      divGbp += shares * d.perShareLocal * fxOnDate(fxRates, d.date, currency);
    }
  }

  if (startValue <= 0) return 0;
  return (endValue + divGbp - startValue) / startValue;
}
