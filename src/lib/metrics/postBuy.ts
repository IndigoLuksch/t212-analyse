import type { DivEvent, FxRate, PriceBar } from './types';
import { addDays, daysBetween } from './utils';
import { gbpTotalReturn } from './window';

export const POST_BUY_HORIZONS = [30, 90, 182, 365, 730] as const;

export type PostBuyHorizon = (typeof POST_BUY_HORIZONS)[number];

export interface PostBuyPoint {
  horizonDays: number;
  endDate: string | null;
  /** GBP total return of the bought shares over the window. */
  raw: number | null;
  /** raw − benchmark over the identical window. */
  adj: number | null;
  /** False when asOf − buyDate < horizonDays: excluded from aggregates. */
  matured: boolean;
}

export interface PostBuyResult {
  buyDate: string;
  capitalGbp: number;
  points: PostBuyPoint[];
}

export interface PostBuyInput {
  buyDate: string;
  capitalGbp: number;
  /** Split-adjusted quantity at the buy. */
  shares: number;
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

/**
 * Per buy, the bought shares' GBP total return over fixed horizons —
 * cumulative, never annualised. Immature windows are null and excluded from
 * aggregates.
 */
export function computePostBuy(input: PostBuyInput): PostBuyResult {
  const {
    buyDate,
    capitalGbp,
    shares,
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

  const points: PostBuyPoint[] = POST_BUY_HORIZONS.map((horizonDays) => {
    const matured = daysBetween(buyDate, asOfDate) >= horizonDays;
    const targetDate = addDays(buyDate, horizonDays);
    const cap = matured ? targetDate : asOfDate;

    let endDate: string | null = null;
    for (const d of tradingDates) {
      if (d <= cap && d > buyDate && (endDate === null || d > endDate)) {
        endDate = d;
      }
    }

    if (!matured || endDate === null) {
      return { horizonDays, endDate, raw: null, adj: null, matured };
    }

    const raw = gbpTotalReturn(
      buyDate,
      endDate,
      prices,
      dividends,
      fxRates,
      currency,
      shares,
    );
    const bench = gbpTotalReturn(
      buyDate,
      endDate,
      benchmarkPrices,
      [],
      benchmarkFxRates,
      benchmarkCurrency,
      1,
    );

    return { horizonDays, endDate, raw, adj: raw - bench, matured };
  });

  return { buyDate, capitalGbp, points };
}
