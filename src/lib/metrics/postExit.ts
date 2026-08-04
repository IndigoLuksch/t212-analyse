import type { DivEvent, ExitEvent, FxRate, PostExitResult, PriceBar } from './types';
import { daysBetween } from './utils';
import { gbpTotalReturn } from './window';

/**
 * Below this the annualising exponent blows a few weeks of noise up into a
 * headline rate, so we report nothing — same convention as XIRR.
 */
const MIN_WINDOW_DAYS = 182;

const DAYS_PER_YEAR = 365.25;

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

/** Compound a whole-window return to a yearly rate. */
function annualise(totalReturn: number, days: number): number {
  const growth = 1 + totalReturn;
  if (growth <= 0) return -1;
  return growth ** (DAYS_PER_YEAR / days) - 1;
}

/**
 * Per exit event, the sold shares' GBP total return from the sale to today,
 * expressed as a yearly rate; raw and index-adjusted.
 */
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

  // Last session with a real close, so a stale feed does not stretch the window.
  let endDate: string | null = null;
  for (const d of tradingDates) {
    if (d <= asOfDate && d > exitEvent.date && (endDate === null || d > endDate)) {
      endDate = d;
    }
  }

  const days = endDate === null ? 0 : daysBetween(exitEvent.date, endDate);
  if (endDate === null || days < MIN_WINDOW_DAYS) {
    return { exitEvent, endDate, windowDays: days, rawAnnualised: null, adjAnnualised: null };
  }

  const rawReturn = gbpTotalReturn(
    exitEvent.date,
    endDate,
    prices,
    dividends,
    fxRates,
    currency,
    exitEvent.shares,
  );

  const benchReturn = gbpTotalReturn(
    exitEvent.date,
    endDate,
    benchmarkPrices,
    [],
    benchmarkFxRates,
    benchmarkCurrency,
    1,
  );

  const rawAnnualised = annualise(rawReturn, days);

  return {
    exitEvent,
    endDate,
    windowDays: days,
    rawAnnualised,
    adjAnnualised: rawAnnualised - annualise(benchReturn, days),
  };
}
