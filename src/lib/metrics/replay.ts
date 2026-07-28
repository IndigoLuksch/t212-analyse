import type { CashFlow, PriceBar, ReplayResult } from './types';
import { closeOnDate, sortByDate } from './utils';
import { computeXirr } from './xirr';

export interface ReplayInput {
  flows: CashFlow[];
  benchmarkPrices: PriceBar[];
}

export interface ReplayOptions {
  /**
   * The EXTERNAL cash flows only — buys, sells and dividends, with no terminal
   * valuation. Defaults to `actualFlows`.
   *
   * This distinction is the whole point of the replay: the replayed schedule
   * must be your real money movements, while the ending value comes from the
   * index position. Passing flows that already contain your actual terminal
   * value makes the replay reproduce your own result and the edge collapses
   * to ~0.
   */
  externalFlows?: CashFlow[];
  /** Valuation date for the leftover index position. Defaults to the last flow date. */
  asOfDate?: string;
}

/**
 * Replay the same GBP flows, on the same days, into the benchmark
 * (accumulating, so index dividends are inside the price).
 *
 * pickingEdge = actualXirr − replayXirr: what your picking added over having
 * moved identical money into a world tracker.
 */
export function computeReplay(
  actualFlows: CashFlow[],
  benchmarkPrices: PriceBar[],
  options: ReplayOptions = {},
): ReplayResult {
  const external = options.externalFlows ?? actualFlows;
  const sorted = [...external].sort((a, b) => a.date.localeCompare(b.date));
  const prices = sortByDate(benchmarkPrices);

  let shares = 0;
  const replayFlows: CashFlow[] = [];

  for (const f of sorted) {
    const price = closeOnDate(prices, f.date);

    if (f.amountGbp < 0) {
      shares += -f.amountGbp / price;
    } else if (f.amountGbp > 0 && shares > 0) {
      // Withdrawal: sell the equivalent index shares. Clamped at zero — if the
      // index could not have funded the withdrawal, the position simply empties.
      shares = Math.max(0, shares - f.amountGbp / price);
    }
    // The replayed schedule is identical by construction; only the ending
    // value differs, and that is what the comparison measures.
    replayFlows.push({ date: f.date, amountGbp: f.amountGbp });
  }

  const asOfDate = options.asOfDate ?? sorted[sorted.length - 1]?.date;
  if (asOfDate && shares > 0) {
    replayFlows.push({
      date: asOfDate,
      amountGbp: shares * closeOnDate(prices, asOfDate),
    });
  }

  const actualXirr = computeXirr(actualFlows);
  const replayXirrResult = computeXirr(replayFlows);

  const pickingEdge =
    actualXirr.xirr !== null && replayXirrResult.xirr !== null
      ? actualXirr.xirr - replayXirrResult.xirr
      : null;

  return {
    replayXirr: replayXirrResult.xirr,
    replayTotalReturn: replayXirrResult.totalReturn,
    pickingEdge,
    suppressAnnualised: actualXirr.suppressAnnualised,
  };
}
