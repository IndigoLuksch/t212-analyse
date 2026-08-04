import type { FxRate, Order, PriceBar, Split, DivEvent } from './types';
import { computeEntryContext } from './entryContext';
import { addDays, closeOnDate, fxOnDate, toUtcDate } from './utils';

export interface TickerMarket {
  prices: PriceBar[];
  splits: Split[];
  fxRates: FxRate[];
  currency: string;
  tradingDates: string[];
  dividends: DivEvent[];
}

export interface RuleContext {
  /** Per t212 ticker. */
  markets: Map<string, TickerMarket>;
  benchmarkPrices: PriceBar[];
  medianFeeGbp: number;
  asOfDate: string;
}

export interface RuleParamDef {
  key: string;
  label: string;
  values: number[];
}

export interface RuleDef {
  id: string;
  label: string;
  params: RuleParamDef[];
  apply(orders: Order[], ctx: RuleContext, params: Record<string, number>): Order[];
}

/** Next trading date on or after `date`, else `date` unchanged. */
export function snapToTradingDate(date: string, tradingDates: string[]): string {
  for (const d of tradingDates) {
    if (d >= date) return d;
  }
  return tradingDates[tradingDates.length - 1] ?? date;
}

function marketFor(order: Order, ctx: RuleContext): TickerMarket | undefined {
  return ctx.markets.get(order.t212Ticker);
}

/** Rebuild quantity from GBP notional at a (possibly new) fill date. */
function repriceBuy(
  order: Order,
  newDate: string,
  market: TickerMarket,
  feesGbp: number,
): Order {
  const fx = fxOnDate(market.fxRates, newDate, market.currency);
  const close = closeOnDate(market.prices, newDate);
  const priceGbp = close * fx;
  const qty = priceGbp > 0 ? order.totalGbp / priceGbp : order.quantity;
  return {
    ...order,
    executedAt: `${newDate}T12:00:00.000Z`,
    quantity: qty,
    fillPriceLocal: close,
    feesGbp,
  };
}

function cloneOrders(orders: Order[]): Order[] {
  return orders.map((o) => ({ ...o }));
}

export const neverSellRule: RuleDef = {
  id: 'neverSell',
  label: 'Never sell',
  params: [],
  apply(orders) {
    return orders.filter((o) => o.side === 'BUY');
  },
};

export const delayRule: RuleDef = {
  id: 'delay',
  label: 'Delay buys',
  params: [
    {
      key: 'days',
      label: 'Days',
      values: [0, 7, 14, 30, 60, 90, 180],
    },
  ],
  apply(orders, ctx, params) {
    const days = params.days ?? 0;
    if (days === 0) return cloneOrders(orders);
    return orders.map((o) => {
      if (o.side !== 'BUY') return { ...o };
      const market = marketFor(o, ctx);
      if (!market || market.prices.length === 0) return { ...o };
      const target = snapToTradingDate(addDays(toUtcDate(o.executedAt), days), market.tradingDates);
      if (target > ctx.asOfDate) return { ...o }; // cannot delay past as-of — keep original
      return repriceBuy(o, target, market, o.feesGbp);
    });
  },
};

export const paceRule: RuleDef = {
  id: 'pace',
  label: 'Pace buys',
  params: [
    { key: 'slices', label: 'Slices', values: [1, 2, 3, 4, 6] },
    { key: 'days', label: 'Over days', values: [0, 14, 30, 60, 90] },
  ],
  apply(orders, ctx, params) {
    const k = Math.max(1, Math.round(params.slices ?? 1));
    const D = params.days ?? 0;
    if (k === 1) return cloneOrders(orders);
    const out: Order[] = [];
    for (const o of orders) {
      if (o.side !== 'BUY') {
        out.push({ ...o });
        continue;
      }
      const market = marketFor(o, ctx);
      if (!market || market.prices.length === 0) {
        out.push({ ...o });
        continue;
      }
      const sliceGbp = o.totalGbp / k;
      const fee = ctx.medianFeeGbp;
      const interval = k > 1 ? D / k : 0;
      for (let i = 0; i < k; i++) {
        const offset = Math.round(interval * i);
        const target = snapToTradingDate(
          addDays(toUtcDate(o.executedAt), offset),
          market.tradingDates,
        );
        const date = target > ctx.asOfDate ? toUtcDate(o.executedAt) : target;
        const slice: Order = {
          ...o,
          id: `${o.id}#p${i}`,
          totalGbp: sliceGbp,
          feesGbp: fee,
        };
        out.push(repriceBuy(slice, date, market, fee));
      }
    }
    return out;
  },
};

/** Predicate ids for conditional rule. */
export const CONDITIONAL_PREDICATES = [
  { id: 0, label: 'Above 200dma' },
  { id: 1, label: 'Within 10% of 52w high' },
  { id: 2, label: 'Trailing 3m > 0' },
] as const;

function predicateHolds(predId: number, date: string, prices: PriceBar[]): boolean {
  const ctx = computeEntryContext(date, prices);
  if (predId === 0) return ctx.pctFrom200dma != null && ctx.pctFrom200dma > 0;
  if (predId === 1) return ctx.pctFrom52wHigh != null && ctx.pctFrom52wHigh >= -0.1;
  if (predId === 2) return ctx.trailing3mReturn != null && ctx.trailing3mReturn > 0;
  return true;
}

export const conditionalRule: RuleDef = {
  id: 'conditional',
  label: 'Conditional buys',
  params: [
    { key: 'predicate', label: 'Predicate', values: [0, 1, 2] },
    /** 0 = skip, 1 = defer */
    { key: 'onFail', label: 'On fail', values: [0, 1] },
    { key: 'maxDeferDays', label: 'Max defer days', values: [7, 14, 30, 60, 90] },
  ],
  apply(orders, ctx, params) {
    const predId = params.predicate ?? 0;
    const defer = (params.onFail ?? 0) === 1;
    const maxDefer = params.maxDeferDays ?? 30;
    const out: Order[] = [];
    for (const o of orders) {
      if (o.side !== 'BUY') {
        out.push({ ...o });
        continue;
      }
      const market = marketFor(o, ctx);
      if (!market) {
        out.push({ ...o });
        continue;
      }
      const date = toUtcDate(o.executedAt);
      if (predicateHolds(predId, date, market.prices)) {
        out.push({ ...o });
        continue;
      }
      if (!defer) continue; // skip
      let placed: Order | null = null;
      for (let d = 1; d <= maxDefer; d++) {
        const candidate = snapToTradingDate(addDays(date, d), market.tradingDates);
        if (candidate > ctx.asOfDate) break;
        if (predicateHolds(predId, candidate, market.prices)) {
          placed = repriceBuy(o, candidate, market, o.feesGbp);
          break;
        }
      }
      if (placed) out.push(placed);
      // else skipped after max defer
    }
    return out;
  },
};

export const sizingRule: RuleDef = {
  id: 'sizing',
  label: 'Flat size',
  params: [
    {
      key: 'flatGbp',
      label: 'GBP per buy',
      values: [100, 250, 500, 1000, 2000, 5000],
    },
  ],
  apply(orders, ctx, params) {
    const flat = params.flatGbp ?? 500;
    return orders.map((o) => {
      if (o.side !== 'BUY') return { ...o };
      const market = marketFor(o, ctx);
      if (!market || market.prices.length === 0) return { ...o };
      const date = toUtcDate(o.executedAt);
      const resized = { ...o, totalGbp: flat, feesGbp: ctx.medianFeeGbp };
      return repriceBuy(resized, date, market, ctx.medianFeeGbp);
    });
  },
};

export const selectionRule: RuleDef = {
  id: 'selection',
  label: 'No averaging down',
  params: [
    {
      key: 'maxDrawdown',
      label: 'Skip if below avg by %',
      values: [5, 10, 15, 20, 30],
    },
  ],
  apply(orders, ctx, params) {
    const maxDd = (params.maxDrawdown ?? 10) / 100;
    const out: Order[] = [];
    // Per-ticker running avg cost (local, split-unadjusted for simplicity on fill price)
    const avg = new Map<string, { shares: number; cost: number }>();
    const chrono = [...orders].sort((a, b) => a.executedAt.localeCompare(b.executedAt));
    for (const o of chrono) {
      if (o.side === 'SELL') {
        out.push({ ...o });
        const st = avg.get(o.t212Ticker);
        if (st && st.shares > 0) {
          const sold = Math.min(o.quantity, st.shares);
          const frac = sold / st.shares;
          st.cost *= 1 - frac;
          st.shares -= sold;
        }
        continue;
      }
      const st = avg.get(o.t212Ticker) ?? { shares: 0, cost: 0 };
      if (st.shares > 0) {
        const avgPrice = st.cost / st.shares;
        if (avgPrice > 0 && (avgPrice - o.fillPriceLocal) / avgPrice > maxDd) {
          // skip this buy — averaging down too far
          continue;
        }
      }
      out.push({ ...o });
      st.shares += o.quantity;
      st.cost += o.quantity * o.fillPriceLocal;
      avg.set(o.t212Ticker, st);
    }
    return out;
  },
};

export const RULES: RuleDef[] = [
  neverSellRule,
  delayRule,
  paceRule,
  conditionalRule,
  sizingRule,
  selectionRule,
];

export function getRule(id: string): RuleDef | undefined {
  return RULES.find((r) => r.id === id);
}
