import type { DivEvent, ExitEvent, FxRate, PostExitHorizon, PostExitResult, PriceBar } from './types';
import { closeOnDate, fxOnDate, tradingDayOffset } from './utils';

const HORIZONS = [
  { days: 21, label: '1m' },
  { days: 63, label: '3m' },
  { days: 126, label: '6m' },
  { days: 252, label: '12m' },
] as const;

export interface PostExitInput {
  exitEvent: ExitEvent;
  prices: PriceBar[];
  dividends: DivEvent[];
  fxRates: FxRate[];
  currency: string;
  benchmarkPrices: PriceBar[];
  benchmarkFxRates: FxRate[];
  benchmarkCurrency: string;
  tradingDates: string[];
  asOfDate?: string;
}

function gbpTotalReturn(
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

/** Per exit event, stock GBP total return at trading-day horizons; raw and index-adjusted. */
export function computePostExit(input: PostExitInput): PostExitResult {
  const {
    exitEvent,
    prices,
    dividends,
    fxRates,
    currency,
    benchmarkPrices,
    benchmarkFxRates,
    benchmarkCurrency,
    tradingDates,
    asOfDate = new Date().toISOString().slice(0, 10),
  } = input;

  const horizons: PostExitHorizon[] = [];

  for (const h of HORIZONS) {
    const targetDate = tradingDayOffset(exitEvent.date, h.days, tradingDates);
    if (targetDate === null || targetDate > asOfDate) continue;

    const rawReturn = gbpTotalReturn(
      exitEvent.date,
      targetDate,
      prices,
      dividends,
      fxRates,
      currency,
      exitEvent.shares,
    );

    const benchReturn = gbpTotalReturn(
      exitEvent.date,
      targetDate,
      benchmarkPrices,
      [],
      benchmarkFxRates,
      benchmarkCurrency,
      1,
    );

    horizons.push({
      horizonDays: h.days,
      label: h.label,
      rawReturn,
      adjustedReturn: rawReturn - benchReturn,
    });
  }

  return { exitEvent, horizons };
}
