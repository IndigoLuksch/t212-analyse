import type {
  DailyHolding,
  DividendCash,
  FxRate,
  Order,
  PriceBar,
  Split,
} from './types';
import { adjustOrder } from './splits';
import {
  applyDust,
  closeOnDate,
  fxOnDate,
  sortOrdersByExecution,
  toUtcDate,
  uniqueSortedDates,
} from './utils';

export interface HoldingsInput {
  orders: Order[];
  splits: Split[];
  prices: PriceBar[];
  fxRates: FxRate[];
  currency: string;
  dividends?: DividendCash[];
  asOfDate?: string;
}

export interface HoldingsResult {
  daily: DailyHolding[];
  currentShares: number;
  avgCostGbp: number;
  avgFillLocal: number;
  realisedPnLGbp: number;
}

interface AdjustedFill {
  date: string;
  side: 'BUY' | 'SELL';
  adjQty: number;
  adjPrice: number;
  totalGbp: number;
  feesGbp: number;
}

function buildAdjustedFills(orders: Order[], splits: Split[]): AdjustedFill[] {
  return sortOrdersByExecution(orders).map((o) => {
    const { adjQty, adjPrice } = adjustOrder(o, splits);
    return {
      date: toUtcDate(o.executedAt),
      side: o.side,
      adjQty,
      adjPrice,
      totalGbp: o.totalGbp,
      feesGbp: o.feesGbp,
    };
  });
}

/**
 * Dates the position actually exists over: from the first fill to `asOfDate`.
 *
 * Price history starts at the instrument's listing, often years before the
 * first purchase. Including those dates yields a long leading run of zero
 * holdings, which stretches every chart's x-axis over empty space and costs
 * a proportional amount of compute.
 */
function collectDates(
  fills: AdjustedFill[],
  prices: PriceBar[],
  asOfDate: string,
): string[] {
  const firstFill = fills.reduce<string | null>(
    (min, f) => (min === null || f.date < min ? f.date : min),
    null,
  );
  if (firstFill === null) return uniqueSortedDates([asOfDate]);

  const dates = fills.map((f) => f.date);
  for (const p of prices) {
    if (p.date >= firstFill && p.date <= asOfDate) dates.push(p.date);
  }
  dates.push(asOfDate);
  return uniqueSortedDates(dates);
}

/** Daily holdings with moving-average cost basis in GBP. */
export function computeHoldings(input: HoldingsInput): HoldingsResult {
  const {
    orders,
    splits,
    prices,
    fxRates,
    currency,
    asOfDate = new Date().toISOString().slice(0, 10),
  } = input;

  const fills = buildAdjustedFills(orders, splits);
  const dates = collectDates(fills, prices, asOfDate);

  let shares = 0;
  let episodePeak = 0;
  let costBasisGbp = 0;
  let costBasisLocal = 0;
  let realisedPnLGbp = 0;

  const fillsByDate = new Map<string, AdjustedFill[]>();
  for (const f of fills) {
    const list = fillsByDate.get(f.date) ?? [];
    list.push(f);
    fillsByDate.set(f.date, list);
  }

  const daily: DailyHolding[] = [];

  for (const date of dates) {
    const dayFills = fillsByDate.get(date) ?? [];
    for (const f of dayFills) {
      if (f.side === 'BUY') {
        const buyCost = f.totalGbp + f.feesGbp;
        costBasisGbp += buyCost;
        costBasisLocal += f.adjQty * f.adjPrice;
        shares += f.adjQty;
      } else {
        const soldQty = Math.min(f.adjQty, shares);
        const avgCost = shares > 0 ? costBasisGbp / shares : 0;
        const avgLocal = shares > 0 ? costBasisLocal / shares : 0;
        const costRemoved = soldQty * avgCost;
        const proceeds = f.totalGbp - f.feesGbp;
        realisedPnLGbp += proceeds - costRemoved;
        costBasisGbp -= costRemoved;
        costBasisLocal -= soldQty * avgLocal;
        shares -= soldQty;
      }
      episodePeak = Math.max(episodePeak, shares);
      if (applyDust(shares, episodePeak) === 0) {
        shares = 0;
        costBasisGbp = 0;
        costBasisLocal = 0;
        episodePeak = 0;
      }
    }

    const fx = fxOnDate(fxRates, date, currency);
    const close = closeOnDate(prices, date);
    const marketValueGbp = shares * close * fx;

    daily.push({
      date,
      shares,
      avgCostGbp: shares > 0 ? costBasisGbp / shares : 0,
      avgFillLocal: shares > 0 ? costBasisLocal / shares : 0,
      realisedPnLGbp,
      marketValueGbp,
    });
  }

  const last = daily[daily.length - 1];
  return {
    daily,
    currentShares: last?.shares ?? 0,
    avgCostGbp: last?.avgCostGbp ?? 0,
    avgFillLocal: last?.avgFillLocal ?? 0,
    realisedPnLGbp: last?.realisedPnLGbp ?? 0,
  };
}

/** Net invested GBP on a given date (cumulative buys − sells including fees). */
export function netInvestedGbp(orders: Order[], asOfDate: string): number {
  let invested = 0;
  for (const o of sortOrdersByExecution(orders)) {
    const d = toUtcDate(o.executedAt);
    if (d > asOfDate) break;
    if (o.side === 'BUY') {
      invested += o.totalGbp + o.feesGbp;
    } else {
      invested -= o.totalGbp - o.feesGbp;
    }
  }
  return invested;
}
