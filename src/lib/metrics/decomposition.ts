import type { Decomposition, DividendCash, FxRate, Order, PriceBar, Split } from './types';
import { adjustOrder } from './splits';
import { closeOnDate, fxOnDate, sortOrdersByExecution, toUtcDate } from './utils';

export interface DecompositionInput {
  orders: Order[];
  splits: Split[];
  prices: PriceBar[];
  fxRates: FxRate[];
  currency: string;
  dividends: DividendCash[];
  asOfDate?: string;
}

interface Tranche {
  adjQty: number;
  adjPrice: number;
  entryDate: string;
  entryFx: number;
}

/**
 * Price + dividends + FX decomposition summing exactly to total P&L.
 * Price = local-currency value change converted at entry FX (FIFO per buy tranche);
 * FX = residual (includes cross term).
 */
export function computeDecomposition(input: DecompositionInput): Decomposition {
  const {
    orders,
    splits,
    prices,
    fxRates,
    currency,
    dividends,
    asOfDate = new Date().toISOString().slice(0, 10),
  } = input;

  const fxEnd = fxOnDate(fxRates, asOfDate, currency);
  const closeEnd = closeOnDate(prices, asOfDate);

  let investedGbp = 0;
  let returnedGbp = 0;
  let dividendsGbp = 0;
  let priceGbp = 0;

  const tranches: Tranche[] = [];

  for (const o of sortOrdersByExecution(orders)) {
    const d = toUtcDate(o.executedAt);
    if (d > asOfDate) break;

    if (o.side === 'BUY') {
      const { adjQty, adjPrice } = adjustOrder(o, splits);
      investedGbp += o.totalGbp + o.feesGbp;
      tranches.push({
        adjQty,
        adjPrice,
        entryDate: d,
        entryFx: fxOnDate(fxRates, d, currency),
      });
    } else {
      returnedGbp += o.totalGbp - o.feesGbp;
      const { adjQty: sellQty, adjPrice: sellPrice } = adjustOrder(o, splits);
      let remaining = sellQty;

      while (remaining > 0 && tranches.length > 0) {
        const t = tranches[0];
        const take = Math.min(remaining, t.adjQty);
        priceGbp += (sellPrice - t.adjPrice) * take * t.entryFx;
        t.adjQty -= take;
        remaining -= take;
        if (t.adjQty <= 0) tranches.shift();
      }
    }
  }

  for (const d of dividends) {
    if (toUtcDate(d.paidAt) <= asOfDate) {
      dividendsGbp += d.amountGbp;
    }
  }

  let openShares = 0;
  for (const t of tranches) {
    priceGbp += (closeEnd - t.adjPrice) * t.adjQty * t.entryFx;
    openShares += t.adjQty;
  }

  const openValueGbp = openShares * closeEnd * fxEnd;
  const totalGbp = returnedGbp + openValueGbp + dividendsGbp - investedGbp;
  const fxGbp = totalGbp - priceGbp - dividendsGbp;

  return {
    priceGbp,
    dividendsGbp,
    fxGbp,
    totalGbp,
  };
}
