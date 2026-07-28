import type {
  BuyDisciplineResult,
  DailyHolding,
  DividendCash,
  FxRate,
  Order,
  PositionReturn,
  PriceBar,
  Split,
  TrancheReturn,
  WorstPoint,
} from './types';
import { adjustOrder } from './splits';
import { computeHoldings, netInvestedGbp } from './holdings';
import {
  closeOnDate,
  daysBetween,
  fxOnDate,
  sortByDate,
  sortOrdersByExecution,
  toUtcDate,
} from './utils';

export interface ReturnsInput {
  orders: Order[];
  splits: Split[];
  prices: PriceBar[];
  fxRates: FxRate[];
  currency: string;
  dividends: DividendCash[];
  asOfDate?: string;
}

/** Position return: invested, returned, open value, total return. */
export function computePositionReturn(input: ReturnsInput): PositionReturn {
  const {
    orders,
    splits,
    prices,
    fxRates,
    currency,
    dividends,
    asOfDate = new Date().toISOString().slice(0, 10),
  } = input;

  const holdings = computeHoldings({
    orders,
    splits,
    prices,
    fxRates,
    currency,
    asOfDate,
  });

  let invested = 0;
  for (const o of sortOrdersByExecution(orders)) {
    if (toUtcDate(o.executedAt) > asOfDate) break;
    if (o.side === 'BUY') {
      invested += o.totalGbp + o.feesGbp;
    }
  }

  let returned = 0;
  for (const o of sortOrdersByExecution(orders)) {
    if (toUtcDate(o.executedAt) > asOfDate) break;
    if (o.side === 'SELL') {
      returned += o.totalGbp - o.feesGbp;
    }
  }
  for (const d of dividends) {
    if (toUtcDate(d.paidAt) <= asOfDate) {
      returned += d.amountGbp;
    }
  }

  const openValue = holdings.currentShares > 0 ? holdings.daily[holdings.daily.length - 1].marketValueGbp : 0;
  const totalReturn = invested > 0 ? (returned + openValue - invested) / invested : 0;

  return { invested, returned, openValue, totalReturn };
}

/**
 * Buy discipline: value-weighted avg local fill / time-average close over [first buy, last buy].
 * Window < 7 days → null.
 */
export function computeBuyDiscipline(
  orders: Order[],
  splits: Split[],
  prices: PriceBar[],
): BuyDisciplineResult {
  const buys = sortOrdersByExecution(orders).filter((o) => o.side === 'BUY');
  if (buys.length === 0) {
    return { ratio: null, avgFillLocal: 0, avgCloseLocal: 0 };
  }

  const firstDate = toUtcDate(buys[0].executedAt);
  const lastDate = toUtcDate(buys[buys.length - 1].executedAt);

  if (daysBetween(firstDate, lastDate) < 7) {
    let totalValue = 0;
    let totalQty = 0;
    for (const b of buys) {
      const { adjQty, adjPrice } = adjustOrder(b, splits);
      totalValue += adjQty * adjPrice;
      totalQty += adjQty;
    }
    return {
      ratio: null,
      avgFillLocal: totalQty > 0 ? totalValue / totalQty : 0,
      avgCloseLocal: 0,
    };
  }

  let weightedFill = 0;
  let totalQty = 0;
  for (const b of buys) {
    const { adjQty, adjPrice } = adjustOrder(b, splits);
    weightedFill += adjQty * adjPrice;
    totalQty += adjQty;
  }
  const avgFillLocal = totalQty > 0 ? weightedFill / totalQty : 0;

  const windowPrices = sortByDate(
    prices.filter((p) => p.date >= firstDate && p.date <= lastDate),
  );
  const avgCloseLocal =
    windowPrices.length > 0
      ? windowPrices.reduce((s, p) => s + p.closeLocal, 0) / windowPrices.length
      : 0;

  const ratio = avgCloseLocal > 0 ? avgFillLocal / avgCloseLocal : null;

  return { ratio, avgFillLocal, avgCloseLocal };
}

/** Classify tranches as averaging up or down; capital-weighted GBP total return per class. */
export function computeTrancheReturns(
  orders: Order[],
  splits: Split[],
  prices: PriceBar[],
  fxRates: FxRate[],
  currency: string,
  asOfDate?: string,
): { up: { count: number; totalReturn: number }; down: { count: number; totalReturn: number }; tranches: TrancheReturn[] } {
  const end = asOfDate ?? new Date().toISOString().slice(0, 10);
  const buys = sortOrdersByExecution(orders).filter((o) => o.side === 'BUY');
  if (buys.length <= 1) {
    return { up: { count: 0, totalReturn: 0 }, down: { count: 0, totalReturn: 0 }, tranches: [] };
  }

  let runningShares = 0;
  let runningCostGbp = 0;
  let runningCostLocal = 0;
  const tranches: TrancheReturn[] = [];

  for (let i = 0; i < buys.length; i++) {
    const b = buys[i];
    const { adjQty, adjPrice } = adjustOrder(b, splits);
    const capitalGbp = b.totalGbp + b.feesGbp;

    if (i === 0) {
      runningShares = adjQty;
      runningCostGbp = capitalGbp;
      runningCostLocal = adjQty * adjPrice;
      continue;
    }

    const avgCostLocal = runningShares > 0 ? runningCostLocal / runningShares : 0;
    const classification: 'up' | 'down' = adjPrice >= avgCostLocal ? 'up' : 'down';

    const fxEnd = fxOnDate(fxRates, end, currency);
    const closeEnd = closeOnDate(prices, end);
    const valueEnd = adjQty * closeEnd * fxEnd;
    const totalReturn = capitalGbp > 0 ? (valueEnd - capitalGbp) / capitalGbp : 0;

    tranches.push({
      trancheId: b.id,
      date: toUtcDate(b.executedAt),
      classification,
      capitalGbp,
      totalReturn,
    });

    runningShares += adjQty;
    runningCostGbp += capitalGbp;
    runningCostLocal += adjQty * adjPrice;
  }

  const aggregate = (cls: 'up' | 'down') => {
    const subset = tranches.filter((t) => t.classification === cls);
    const capital = subset.reduce((s, t) => s + t.capitalGbp, 0);
    const weighted =
      capital > 0
        ? subset.reduce((s, t) => s + t.totalReturn * t.capitalGbp, 0) / capital
        : 0;
    return { count: subset.length, totalReturn: weighted };
  };

  return {
    up: aggregate('up'),
    down: aggregate('down'),
    tranches,
  };
}

/** Worst drawdown while shares > 0 within an episode's daily holdings slice. */
export function computeWorstPoint(
  daily: DailyHolding[],
  orders: Order[],
  episodeStart: string,
  episodeEnd: string | null,
): WorstPoint | null {
  const end = episodeEnd ?? daily[daily.length - 1]?.date;
  const slice = daily.filter((d) => d.date >= episodeStart && d.date <= end! && d.shares > 0);

  if (slice.length === 0) return null;

  let worst: WorstPoint | null = null;

  for (const d of slice) {
    const invested = netInvestedGbp(
      orders.filter((o) => toUtcDate(o.executedAt) <= d.date),
      d.date,
    );
    if (invested <= 0) continue;
    const drawdown = d.marketValueGbp / invested - 1;
    if (worst === null || drawdown < worst.drawdown) {
      worst = { date: d.date, drawdown };
    }
  }

  return worst;
}
