import type { CashFlow, DividendCash, Order, PriceBar } from './types';
import { computeHoldings } from './holdings';
import { adjustOrder } from './splits';
import { computeXirr } from './xirr';
import {
  getRule,
  type RuleContext,
  type RuleDef,
  type TickerMarket,
} from './rules';
import { closeOnDate, fxOnDate, sortOrdersByExecution, toUtcDate } from './utils';

export type IdlePolicy = 'cash' | 'benchmark' | 'prorata';

export interface PortfolioLeg {
  xirr: number | null;
  totalReturn: number;
  endValueGbp: number;
}

export interface CounterfactualResult {
  actual: PortfolioLeg;
  counterfactual: PortfolioLeg;
  deltaXirr: number | null;
  deltaGbp: number;
  perPosition: { ticker: string; name: string; deltaGbp: number }[];
  nAffected: number;
  capitalAffectedGbp: number;
  splitHalf: { first: number | null; second: number | null; signFlip: boolean };
  clamps: { forcedSellClamps: number; unfundedBuys: number };
  /** Sum of buy totalGbp (+ skipped idle principal for CF). Must match. */
  externalCashActual: number;
  externalCashCounterfactual: number;
}

export interface CounterfactualInput {
  orders: Order[];
  names: Map<string, string>;
  markets: Map<string, TickerMarket>;
  benchmarkPrices: PriceBar[];
  /** Annualised cash interest rate for idle policy `cash` (0 if unknown). */
  cashRate: number;
  medianFeeGbp: number;
  asOfDate: string;
  policy: IdlePolicy;
}

export interface IdleLot {
  date: string;
  amountGbp: number;
  ticker: string;
}

/**
 * Clamp sells to shares held (split-adjusted). Counts every forced reduction.
 */
export function clampSellsToHoldings(
  orders: Order[],
  markets: Map<string, TickerMarket>,
): { orders: Order[]; forcedSellClamps: number } {
  const chrono = sortOrdersByExecution(orders);
  const shares = new Map<string, number>();
  let forcedSellClamps = 0;
  const out: Order[] = [];

  for (const o of chrono) {
    const splits = markets.get(o.t212Ticker)?.splits ?? [];
    const { adjQty } = adjustOrder(o, splits);
    if (o.side === 'BUY') {
      shares.set(o.t212Ticker, (shares.get(o.t212Ticker) ?? 0) + adjQty);
      out.push(o);
      continue;
    }
    const held = shares.get(o.t212Ticker) ?? 0;
    if (adjQty <= held + 1e-9) {
      shares.set(o.t212Ticker, Math.max(0, held - adjQty));
      out.push(o);
      continue;
    }
    forcedSellClamps += 1;
    if (held <= 1e-9) continue;
    const factor = adjQty > 0 ? held / adjQty : 0;
    out.push({
      ...o,
      quantity: o.quantity * factor,
      totalGbp: o.totalGbp * factor,
      feesGbp: o.feesGbp * factor,
    });
    shares.set(o.t212Ticker, 0);
  }
  return { orders: out, forcedSellClamps };
}

/** Recompute cash dividends from div_events × CF shares on each ex-date. */
export function recomputeDividends(
  orders: Order[],
  markets: Map<string, TickerMarket>,
  asOfDate: string,
): DividendCash[] {
  const byTicker = new Map<string, Order[]>();
  for (const o of orders) {
    const list = byTicker.get(o.t212Ticker) ?? [];
    list.push(o);
    byTicker.set(o.t212Ticker, list);
  }

  const divs: DividendCash[] = [];
  let seq = 0;
  for (const [ticker, tOrders] of byTicker) {
    const market = markets.get(ticker);
    if (!market) continue;
    const holdings = computeHoldings({
      orders: tOrders,
      splits: market.splits,
      prices: market.prices,
      fxRates: market.fxRates,
      currency: market.currency,
      asOfDate,
    });
    for (const ev of market.dividends) {
      if (ev.date > asOfDate) continue;
      let sh = 0;
      for (const d of holdings.daily) {
        if (d.date <= ev.date) sh = d.shares;
        else break;
      }
      if (sh <= 0) continue;
      const fx = fxOnDate(market.fxRates, ev.date, market.currency);
      const amountGbp = sh * ev.perShareLocal * fx;
      if (amountGbp <= 0) continue;
      divs.push({
        id: `cf-div-${ticker}-${ev.date}-${seq++}`,
        t212Ticker: ticker,
        paidAt: `${ev.date}T12:00:00.000Z`,
        amountGbp,
      });
    }
  }
  return divs;
}

export function sumBuyTotalGbp(orders: Order[]): number {
  return orders.filter((o) => o.side === 'BUY').reduce((s, o) => s + o.totalGbp, 0);
}

function positionFlows(
  orders: Order[],
  dividends: DividendCash[],
  openValue: number,
  asOf: string,
): CashFlow[] {
  const flows: CashFlow[] = [];
  for (const o of orders) {
    const date = o.executedAt.slice(0, 10);
    if (o.side === 'BUY') {
      flows.push({ date, amountGbp: -(o.totalGbp + o.feesGbp) });
    } else {
      flows.push({ date, amountGbp: o.totalGbp - o.feesGbp });
    }
  }
  for (const d of dividends) {
    flows.push({ date: d.paidAt.slice(0, 10), amountGbp: d.amountGbp });
  }
  if (openValue > 0) {
    flows.push({ date: asOf, amountGbp: openValue });
  }
  return flows;
}

export function findSkippedBuyLots(actual: Order[], cf: Order[]): IdleLot[] {
  const lots: IdleLot[] = [];
  for (const o of actual) {
    if (o.side !== 'BUY') continue;
    const covered = cf.some(
      (c) => c.side === 'BUY' && (c.id === o.id || c.id.startsWith(`${o.id}#`)),
    );
    if (!covered) {
      lots.push({
        date: toUtcDate(o.executedAt),
        amountGbp: o.totalGbp + o.feesGbp,
        ticker: o.t212Ticker,
      });
    }
  }
  return lots;
}

export function growIdleLots(
  lots: IdleLot[],
  policy: IdlePolicy,
  cashRate: number,
  benchmarkPrices: PriceBar[],
  asOfDate: string,
  weights: Map<string, number>,
  markets: Map<string, TickerMarket>,
): number {
  let total = 0;
  for (const lot of lots) {
    if (policy === 'cash') {
      const years =
        (Date.parse(`${asOfDate}T00:00:00Z`) - Date.parse(`${lot.date}T00:00:00Z`)) /
        (365.25 * 86_400_000);
      total += lot.amountGbp * Math.pow(1 + cashRate, Math.max(0, years));
    } else if (policy === 'benchmark') {
      try {
        const p0 = closeOnDate(benchmarkPrices, lot.date);
        const p1 = closeOnDate(benchmarkPrices, asOfDate);
        total += p0 > 0 ? lot.amountGbp * (p1 / p0) : lot.amountGbp;
      } catch {
        total += lot.amountGbp;
      }
    } else {
      let growth = 0;
      let wSum = 0;
      for (const [ticker, w] of weights) {
        if (w <= 0) continue;
        const m = markets.get(ticker);
        if (!m || m.prices.length === 0) continue;
        try {
          const p0 = closeOnDate(m.prices, lot.date);
          const p1 = closeOnDate(m.prices, asOfDate);
          if (p0 > 0) {
            growth += w * (p1 / p0);
            wSum += w;
          }
        } catch {
          /* skip */
        }
      }
      total += wSum > 0 ? lot.amountGbp * (growth / wSum) : lot.amountGbp;
    }
  }
  return total;
}

function evaluateOrders(
  orders: Order[],
  markets: Map<string, TickerMarket>,
  asOfDate: string,
  idleValue: number,
  idlePrincipal: number,
): { leg: PortfolioLeg; perPosition: Map<string, number> } {
  const divs = recomputeDividends(orders, markets, asOfDate);

  const byTicker = new Map<string, Order[]>();
  for (const o of orders) {
    const list = byTicker.get(o.t212Ticker) ?? [];
    list.push(o);
    byTicker.set(o.t212Ticker, list);
  }

  let holdingsValue = 0;
  let invested = idlePrincipal;
  let returned = 0;
  const perPosition = new Map<string, number>();
  const allOrders: Order[] = [];

  for (const [ticker, tOrders] of byTicker) {
    const market = markets.get(ticker);
    if (!market) continue;
    allOrders.push(...tOrders);
    const holdings = computeHoldings({
      orders: tOrders,
      splits: market.splits,
      prices: market.prices,
      fxRates: market.fxRates,
      currency: market.currency,
      asOfDate,
    });
    const mv =
      holdings.currentShares > 0
        ? (holdings.daily[holdings.daily.length - 1]?.marketValueGbp ?? 0)
        : 0;
    let inv = 0;
    let ret = 0;
    for (const o of tOrders) {
      if (o.side === 'BUY') inv += o.totalGbp + o.feesGbp;
      else ret += o.totalGbp - o.feesGbp;
    }
    for (const d of divs.filter((x) => x.t212Ticker === ticker)) {
      ret += d.amountGbp;
    }
    perPosition.set(ticker, ret + mv - inv);
    holdingsValue += mv;
    invested += inv;
    returned += ret;
  }

  const endValueGbp = holdingsValue + idleValue;
  const flows = positionFlows(allOrders, divs, endValueGbp, asOfDate);
  const xirr = computeXirr(flows);
  const totalReturn = invested > 0 ? (returned + endValueGbp - invested) / invested : 0;

  return {
    leg: { xirr: xirr.xirr, totalReturn, endValueGbp },
    perPosition,
  };
}

function deltaForSubset(
  subset: Order[],
  input: CounterfactualInput,
  rule: RuleDef,
  params: Record<string, number>,
): number | null {
  if (!subset.some((o) => o.side === 'BUY')) return null;
  const ctx: RuleContext = {
    markets: input.markets,
    benchmarkPrices: input.benchmarkPrices,
    medianFeeGbp: input.medianFeeGbp,
    asOfDate: input.asOfDate,
  };
  const actual = clampSellsToHoldings(subset, input.markets);
  const a = evaluateOrders(actual.orders, input.markets, input.asOfDate, 0, 0);
  const raw = rule.apply(subset, ctx, params);
  const cf = clampSellsToHoldings(raw, input.markets);
  const skipped = findSkippedBuyLots(subset, cf.orders);
  const idlePrincipal = skipped.reduce((s, l) => s + l.amountGbp, 0);
  const idle = growIdleLots(
    skipped,
    input.policy,
    input.cashRate,
    input.benchmarkPrices,
    input.asOfDate,
    new Map(),
    input.markets,
  );
  const c = evaluateOrders(cf.orders, input.markets, input.asOfDate, idle, idlePrincipal);
  return c.leg.endValueGbp - a.leg.endValueGbp;
}

/**
 * Run one counterfactual: apply rule, clamp, recompute dividends, compare.
 * Throws if external buy notional is not conserved.
 */
export function runCounterfactual(
  input: CounterfactualInput,
  rule: RuleDef,
  params: Record<string, number>,
): CounterfactualResult {
  const { orders, names, markets, benchmarkPrices, cashRate, medianFeeGbp, asOfDate, policy } =
    input;

  const ctx: RuleContext = { markets, benchmarkPrices, medianFeeGbp, asOfDate };

  const actualClamped = clampSellsToHoldings(orders, markets);
  const actualEval = evaluateOrders(actualClamped.orders, markets, asOfDate, 0, 0);

  const rawCf = rule.apply(orders, ctx, params);
  const cfClamped = clampSellsToHoldings(rawCf, markets);

  const weights = new Map<string, number>();
  const nTickers = actualEval.perPosition.size || 1;
  for (const t of actualEval.perPosition.keys()) {
    weights.set(t, 1 / nTickers);
  }

  const skipped = findSkippedBuyLots(orders, cfClamped.orders);
  const idlePrincipal = skipped.reduce((s, l) => s + l.amountGbp, 0);
  const idleValue = growIdleLots(
    skipped,
    policy,
    cashRate,
    benchmarkPrices,
    asOfDate,
    weights,
    markets,
  );

  const cfEval = evaluateOrders(
    cfClamped.orders,
    markets,
    asOfDate,
    idleValue,
    idlePrincipal,
  );

  const externalCashActual = sumBuyTotalGbp(orders);
  const externalCashCounterfactual = sumBuyTotalGbp(cfClamped.orders) + idlePrincipal;

  if (
    rule.id !== 'sizing' &&
    Math.abs(externalCashActual - externalCashCounterfactual) > 0.05
  ) {
    throw new Error(
      `External cash not conserved: actual ${externalCashActual} vs cf ${externalCashCounterfactual}`,
    );
  }

  const perPosition: CounterfactualResult['perPosition'] = [];
  const tickers = new Set([...actualEval.perPosition.keys(), ...cfEval.perPosition.keys()]);
  for (const t of tickers) {
    perPosition.push({
      ticker: t,
      name: names.get(t) ?? t,
      deltaGbp: (cfEval.perPosition.get(t) ?? 0) - (actualEval.perPosition.get(t) ?? 0),
    });
  }
  perPosition.sort((a, b) => a.deltaGbp - b.deltaGbp);

  let nAffected = 0;
  let capitalAffectedGbp = 0;
  const cfByRoot = new Map<string, Order[]>();
  for (const o of cfClamped.orders) {
    if (o.side !== 'BUY') continue;
    const root = o.id.split('#')[0]!;
    const list = cfByRoot.get(root) ?? [];
    list.push(o);
    cfByRoot.set(root, list);
  }
  for (const o of orders) {
    if (o.side !== 'BUY') continue;
    const cfBuys = cfByRoot.get(o.id) ?? [];
    const same =
      cfBuys.length === 1 &&
      cfBuys[0]!.executedAt === o.executedAt &&
      Math.abs(cfBuys[0]!.totalGbp - o.totalGbp) < 1e-6;
    if (!same) {
      nAffected += 1;
      capitalAffectedGbp += o.totalGbp + o.feesGbp;
    }
  }

  const buyDates = orders
    .filter((o) => o.side === 'BUY')
    .map((o) => toUtcDate(o.executedAt))
    .sort();
  const mid = buyDates[Math.floor(buyDates.length / 2)] ?? asOfDate;
  const first = deltaForSubset(
    orders.filter((o) => toUtcDate(o.executedAt) <= mid),
    input,
    rule,
    params,
  );
  const second = deltaForSubset(
    orders.filter((o) => toUtcDate(o.executedAt) > mid),
    input,
    rule,
    params,
  );
  const signFlip =
    first != null &&
    second != null &&
    first !== 0 &&
    second !== 0 &&
    Math.sign(first) !== Math.sign(second);

  const deltaGbp = cfEval.leg.endValueGbp - actualEval.leg.endValueGbp;
  const deltaXirr =
    actualEval.leg.xirr != null && cfEval.leg.xirr != null
      ? cfEval.leg.xirr - actualEval.leg.xirr
      : null;

  return {
    actual: actualEval.leg,
    counterfactual: cfEval.leg,
    deltaXirr,
    deltaGbp,
    perPosition,
    nAffected,
    capitalAffectedGbp,
    splitHalf: { first, second, signFlip },
    clamps: {
      forcedSellClamps: cfClamped.forcedSellClamps,
      unfundedBuys: 0,
    },
    externalCashActual,
    externalCashCounterfactual,
  };
}

export function runSweep(
  input: CounterfactualInput,
  ruleId: string,
  paramGrid: Record<string, number[]>,
): { params: Record<string, number>; result: CounterfactualResult }[] {
  const rule = getRule(ruleId);
  if (!rule) throw new Error(`Unknown rule: ${ruleId}`);

  const keys = Object.keys(paramGrid);
  let combos: Record<string, number>[] = [{}];
  for (const key of keys) {
    const values = paramGrid[key] ?? [];
    if (values.length === 0) continue;
    const next: Record<string, number>[] = [];
    for (const c of combos) {
      for (const v of values) next.push({ ...c, [key]: v });
    }
    combos = next;
  }
  if (combos.length === 0) combos = [{}];
  if (combos.length > 12) {
    throw new Error(`Sweep grid too large: ${combos.length} > 12`);
  }

  return combos.map((params) => ({
    params,
    result: runCounterfactual(input, rule, params),
  }));
}
