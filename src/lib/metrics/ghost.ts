import type { DivEvent, ExitEvent, FxRate, GhostResult, PriceBar } from './types';
import { closeOnDate, fxOnDate } from './utils';

export interface GhostInput {
  exitEvent: ExitEvent;
  prices: PriceBar[];
  dividends: DivEvent[];
  fxRates: FxRate[];
  currency: string;
  asOfDate?: string;
}

/** Kept-vs-sold: value of sold shares if held until today. */
export function computeGhost(input: GhostInput): GhostResult {
  const {
    exitEvent,
    prices,
    dividends,
    fxRates,
    currency,
    asOfDate = new Date().toISOString().slice(0, 10),
  } = input;

  const fx = fxOnDate(fxRates, asOfDate, currency);
  const close = closeOnDate(prices, asOfDate);
  const priceValue = exitEvent.shares * close * fx;

  let divGbp = 0;
  for (const d of dividends) {
    if (d.date > exitEvent.date && d.date <= asOfDate) {
      divGbp += exitEvent.shares * d.perShareLocal * fxOnDate(fxRates, d.date, currency);
    }
  }

  const ghostValueGbp = priceValue + divGbp;
  const actualProceedsGbp = exitEvent.proceedsGbp;
  const deltaGbp = ghostValueGbp - actualProceedsGbp;
  const deltaPct =
    actualProceedsGbp > 0 ? deltaGbp / actualProceedsGbp : ghostValueGbp > 0 ? 1 : 0;

  return { ghostValueGbp, actualProceedsGbp, deltaGbp, deltaPct };
}
