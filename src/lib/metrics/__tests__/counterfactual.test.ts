import { describe, expect, it } from 'vitest';
import type { DivEvent, Order, PriceBar } from '../types';
import {
  clampSellsToHoldings,
  recomputeDividends,
  runCounterfactual,
  runSweep,
  type CounterfactualInput,
} from '../counterfactual';
import {
  conditionalRule,
  delayRule,
  neverSellRule,
  paceRule,
  type TickerMarket,
} from '../rules';
import { computeHoldings } from '../holdings';
import { benchmarkPrices } from './fixtures';

const GBP_FX = [{ date: '2023-01-01', ccy: 'GBP', gbpPerUnit: 1 }];

function tradingDatesFromPrices(prices: PriceBar[]): string[] {
  return prices.map((p) => p.date);
}

function makeMarket(
  ticker: string,
  prices: PriceBar[],
  opts?: { dividends?: DivEvent[] },
): TickerMarket {
  return {
    prices,
    splits: [],
    fxRates: GBP_FX,
    currency: 'GBP',
    tradingDates: tradingDatesFromPrices(prices),
    dividends: opts?.dividends ?? [],
  };
}

function makeInput(
  orders: Order[],
  markets: Map<string, TickerMarket>,
  opts?: Partial<CounterfactualInput>,
): CounterfactualInput {
  const names = new Map<string, string>();
  for (const o of orders) names.set(o.t212Ticker, o.t212Ticker);
  return {
    orders,
    names,
    markets,
    benchmarkPrices,
    cashRate: 0.02,
    medianFeeGbp: 1,
    asOfDate: opts?.asOfDate ?? '2024-12-01',
    policy: opts?.policy ?? 'cash',
    ...opts,
  };
}

// --- Long-window identity fixture (>182d, buys + price moves) ---
const ID_TICKER = 'ID.L';
const idPrices: PriceBar[] = [
  { date: '2024-01-15', closeLocal: 100 },
  { date: '2024-04-15', closeLocal: 110 },
  { date: '2024-07-15', closeLocal: 105 },
  { date: '2024-10-15', closeLocal: 115 },
  { date: '2024-12-01', closeLocal: 120 },
];
const idBuy1: Order = {
  id: 'id-b1',
  t212Ticker: ID_TICKER,
  side: 'BUY',
  executedAt: '2024-01-15T12:00:00.000Z',
  quantity: 10,
  fillPriceLocal: 100,
  totalGbp: 1000,
  feesGbp: 1,
};
const idBuy2: Order = {
  id: 'id-b2',
  t212Ticker: ID_TICKER,
  side: 'BUY',
  executedAt: '2024-09-01T12:00:00.000Z',
  quantity: 5,
  fillPriceLocal: 108,
  totalGbp: 540,
  feesGbp: 1,
};
const idMarket = makeMarket(ID_TICKER, idPrices);
const idInput = makeInput([idBuy1, idBuy2], new Map([[ID_TICKER, idMarket]]));

// --- Cash conservation fixture ---
const CC_TICKER = 'CC.L';
const ccPrices: PriceBar[] = [
  { date: '2024-01-01', closeLocal: 50 },
  { date: '2024-02-01', closeLocal: 52 },
  { date: '2024-03-01', closeLocal: 48 },
  { date: '2024-04-01', closeLocal: 55 },
  { date: '2024-05-01', closeLocal: 53 },
  { date: '2024-06-01', closeLocal: 56 },
  { date: '2024-07-01', closeLocal: 54 },
  { date: '2024-08-01', closeLocal: 58 },
  { date: '2024-09-01', closeLocal: 57 },
  { date: '2024-10-01', closeLocal: 60 },
  { date: '2024-11-01', closeLocal: 59 },
  { date: '2024-12-01', closeLocal: 62 },
];
const ccBuy: Order = {
  id: 'cc-b1',
  t212Ticker: CC_TICKER,
  side: 'BUY',
  executedAt: '2024-01-15T12:00:00.000Z',
  quantity: 20,
  fillPriceLocal: 50,
  totalGbp: 1000,
  feesGbp: 0,
};
const ccSell: Order = {
  id: 'cc-s1',
  t212Ticker: CC_TICKER,
  side: 'SELL',
  executedAt: '2024-06-15T12:00:00.000Z',
  quantity: 5,
  fillPriceLocal: 55,
  totalGbp: 275,
  feesGbp: 0,
};
const ccMarket = makeMarket(CC_TICKER, ccPrices);
const ccInput = makeInput([ccBuy, ccSell], new Map([[CC_TICKER, ccMarket]]));

// --- Pace fees fixture ---
const PACE_TICKER = 'PACE.L';
const pacePrices: PriceBar[] = [
  { date: '2024-01-01', closeLocal: 100 },
  { date: '2024-02-01', closeLocal: 101 },
  { date: '2024-03-01', closeLocal: 102 },
  { date: '2024-06-01', closeLocal: 105 },
];
const paceBuy: Order = {
  id: 'pace-b1',
  t212Ticker: PACE_TICKER,
  side: 'BUY',
  executedAt: '2024-01-15T12:00:00.000Z',
  quantity: 10,
  fillPriceLocal: 100,
  totalGbp: 1000,
  feesGbp: 0.5,
};
const paceMarket = makeMarket(PACE_TICKER, pacePrices);
const paceInput = makeInput([paceBuy], new Map([[PACE_TICKER, paceMarket]]), {
  medianFeeGbp: 1.5,
  asOfDate: '2024-06-01',
});

// --- Dividend fixture ---
const DIV_TICKER = 'DIV.L';
const divExDate = '2024-02-01';
const divPrices: PriceBar[] = [
  { date: '2024-01-15', closeLocal: 100 },
  { date: '2024-02-01', closeLocal: 102 },
  { date: '2024-03-01', closeLocal: 103 },
  { date: '2024-04-15', closeLocal: 104 },
  { date: '2024-06-01', closeLocal: 106 },
];
const divBuy: Order = {
  id: 'div-b1',
  t212Ticker: DIV_TICKER,
  side: 'BUY',
  executedAt: '2024-01-15T12:00:00.000Z',
  quantity: 10,
  fillPriceLocal: 100,
  totalGbp: 1000,
  feesGbp: 0,
};
const divMarket = makeMarket(DIV_TICKER, divPrices, {
  dividends: [{ date: divExDate, perShareLocal: 2 }],
});
const divInput = makeInput([divBuy], new Map([[DIV_TICKER, divMarket]]), {
  asOfDate: '2024-06-01',
});

// --- Sell clamp fixture: buy then sell; delay buy past sell ---
const CLAMP_TICKER = 'CLAMP.L';
const clampPrices: PriceBar[] = [
  { date: '2024-01-15', closeLocal: 100 },
  { date: '2024-02-15', closeLocal: 102 },
  { date: '2024-03-15', closeLocal: 104 },
  { date: '2024-04-15', closeLocal: 106 },
  { date: '2024-05-15', closeLocal: 108 },
  { date: '2024-06-01', closeLocal: 110 },
];
const clampBuy: Order = {
  id: 'clamp-b1',
  t212Ticker: CLAMP_TICKER,
  side: 'BUY',
  executedAt: '2024-01-15T12:00:00.000Z',
  quantity: 10,
  fillPriceLocal: 100,
  totalGbp: 1000,
  feesGbp: 0,
};
const clampSell: Order = {
  id: 'clamp-s1',
  t212Ticker: CLAMP_TICKER,
  side: 'SELL',
  executedAt: '2024-02-15T12:00:00.000Z',
  quantity: 10,
  fillPriceLocal: 102,
  totalGbp: 1020,
  feesGbp: 0,
};
const clampMarket = makeMarket(CLAMP_TICKER, clampPrices);
const clampInput = makeInput([clampBuy, clampSell], new Map([[CLAMP_TICKER, clampMarket]]), {
  asOfDate: '2024-06-01',
});

// --- Never-sell fixture: sold into a rise, price keeps rising ---
const NS_TICKER = 'NS.L';
const nsPrices: PriceBar[] = [
  { date: '2024-01-15', closeLocal: 100 },
  { date: '2024-03-01', closeLocal: 110 },
  { date: '2024-04-15', closeLocal: 120 },
  { date: '2024-06-01', closeLocal: 130 },
];
const nsBuy: Order = {
  id: 'ns-b1',
  t212Ticker: NS_TICKER,
  side: 'BUY',
  executedAt: '2024-01-15T12:00:00.000Z',
  quantity: 10,
  fillPriceLocal: 100,
  totalGbp: 1000,
  feesGbp: 0,
};
const nsSell: Order = {
  id: 'ns-s1',
  t212Ticker: NS_TICKER,
  side: 'SELL',
  executedAt: '2024-03-01T12:00:00.000Z',
  quantity: 5,
  fillPriceLocal: 110,
  totalGbp: 550,
  feesGbp: 0,
};
const nsMarket = makeMarket(NS_TICKER, nsPrices);
const nsInput = makeInput([nsBuy, nsSell], new Map([[NS_TICKER, nsMarket]]), {
  asOfDate: '2024-06-01',
});

// --- Split-half sign flip: rising first half, falling second half ---
const RISE_TICKER = 'RISE.L';
const FALL_TICKER = 'FALL.L';
const risePrices: PriceBar[] = [
  { date: '2024-02-01', closeLocal: 100 },
  { date: '2024-03-01', closeLocal: 115 },
  { date: '2024-04-01', closeLocal: 130 },
  { date: '2024-12-01', closeLocal: 140 },
];
const fallPrices: PriceBar[] = [
  { date: '2024-07-01', closeLocal: 100 },
  { date: '2024-08-15', closeLocal: 90 },
  { date: '2024-09-15', closeLocal: 75 },
  { date: '2024-12-01', closeLocal: 70 },
];
const sfBuyRise: Order = {
  id: 'sf-b1',
  t212Ticker: RISE_TICKER,
  side: 'BUY',
  executedAt: '2024-02-01T12:00:00.000Z',
  quantity: 10,
  fillPriceLocal: 100,
  totalGbp: 1000,
  feesGbp: 0,
};
const sfSpacer: Order = {
  id: 'sf-b2',
  t212Ticker: RISE_TICKER,
  side: 'BUY',
  executedAt: '2024-07-01T12:00:00.000Z',
  quantity: 1,
  fillPriceLocal: 100,
  totalGbp: 10,
  feesGbp: 0,
};
const sfBuyFall: Order = {
  id: 'sf-b3',
  t212Ticker: FALL_TICKER,
  side: 'BUY',
  executedAt: '2024-08-15T12:00:00.000Z',
  quantity: 10,
  fillPriceLocal: 90,
  totalGbp: 900,
  feesGbp: 0,
};
const sfMarkets = new Map<string, TickerMarket>([
  [RISE_TICKER, makeMarket(RISE_TICKER, risePrices)],
  [FALL_TICKER, makeMarket(FALL_TICKER, fallPrices)],
]);
const sfInput = makeInput([sfBuyRise, sfSpacer, sfBuyFall], sfMarkets);

describe('counterfactual replay', () => {
  it('delay(0) is identity — XIRR or end value matches actual', () => {
    const result = runCounterfactual(idInput, delayRule, { days: 0 });
    if (result.actual.xirr != null && result.counterfactual.xirr != null) {
      expect(Math.abs(result.actual.xirr - result.counterfactual.xirr)).toBeLessThan(1e-9);
    } else {
      expect(Math.abs(result.actual.endValueGbp - result.counterfactual.endValueGbp)).toBeLessThan(
        1e-6,
      );
    }
    expect(Math.abs(result.deltaGbp)).toBeLessThan(1e-6);
  });

  it('conserves external cash under delay, neverSell, pace, and conditional skip', () => {
    const cases: { rule: typeof delayRule; params: Record<string, number> }[] = [
      { rule: delayRule, params: { days: 7 } },
      { rule: neverSellRule, params: {} },
      { rule: paceRule, params: { slices: 2, days: 30 } },
      { rule: conditionalRule, params: { predicate: 0, onFail: 0, maxDeferDays: 30 } },
    ];
    for (const { rule, params } of cases) {
      const result = runCounterfactual(ccInput, rule, params);
      expect(Math.abs(result.externalCashActual - result.externalCashCounterfactual)).toBeLessThan(
        0.05,
      );
    }
  });

  it('pace(k=2) multiplies fees on counterfactual buys', () => {
    const result = runCounterfactual(paceInput, paceRule, { slices: 2, days: 30 });
    const cfOrders = paceRule.apply(
      paceInput.orders,
      {
        markets: paceInput.markets,
        benchmarkPrices: paceInput.benchmarkPrices,
        medianFeeGbp: paceInput.medianFeeGbp,
        asOfDate: paceInput.asOfDate,
      },
      { slices: 2, days: 30 },
    );
    const cfBuys = cfOrders.filter((o) => o.side === 'BUY');
    const feeSum = cfBuys.reduce((s, o) => s + o.feesGbp, 0);
    expect(cfBuys.length).toBe(2);
    expect(feeSum).toBeCloseTo(2 * paceInput.medianFeeGbp, 6);
    expect(result).toBeDefined();
  });

  it('recomputes dividends — delayed buy past ex-date loses dividend', () => {
    const actualDivs = recomputeDividends(
      [divBuy],
      divInput.markets,
      divInput.asOfDate,
    );
    expect(actualDivs.length).toBe(1);
    expect(actualDivs[0]!.amountGbp).toBeCloseTo(20, 6);

    const delayed = delayRule.apply(
      [divBuy],
      {
        markets: divInput.markets,
        benchmarkPrices: divInput.benchmarkPrices,
        medianFeeGbp: divInput.medianFeeGbp,
        asOfDate: divInput.asOfDate,
      },
      { days: 30 },
    );
    const cfDivs = recomputeDividends(delayed, divInput.markets, divInput.asOfDate);
    expect(cfDivs.length).toBe(0);

    const result = runCounterfactual(divInput, delayRule, { days: 30 });
    expect(result.counterfactual.endValueGbp).toBeLessThan(result.actual.endValueGbp);
  });

  it('clamps sells when delayed buy leaves insufficient shares', () => {
    const result = runCounterfactual(clampInput, delayRule, { days: 60 });
    expect(result.clamps.forcedSellClamps).toBeGreaterThanOrEqual(1);

    const cfOrders = delayRule.apply(clampInput.orders, {
      markets: clampInput.markets,
      benchmarkPrices: clampInput.benchmarkPrices,
      medianFeeGbp: clampInput.medianFeeGbp,
      asOfDate: clampInput.asOfDate,
    }, { days: 60 });
    const { orders: clamped } = clampSellsToHoldings(cfOrders, clampInput.markets);
    const holdings = computeHoldings({
      orders: clamped,
      splits: [],
      prices: clampPrices,
      fxRates: GBP_FX,
      currency: 'GBP',
      asOfDate: clampInput.asOfDate,
    });
    expect(holdings.currentShares).toBeGreaterThanOrEqual(0);
  });

  it('neverSell yields positive delta when actual sold into a rise', () => {
    const result = runCounterfactual(nsInput, neverSellRule, {});
    expect(result.deltaGbp).toBeGreaterThan(0);
  });

  it('splitHalf signFlip on synthetic regime change with delay rule', () => {
    const result = runCounterfactual(sfInput, delayRule, { days: 30 });
    expect(result.splitHalf.first).not.toBeNull();
    expect(result.splitHalf.second).not.toBeNull();
    expect(result.splitHalf.signFlip).toBe(true);
    expect(Math.sign(result.splitHalf.first!)).not.toBe(Math.sign(result.splitHalf.second!));
  });

  it('runSweep rejects grid larger than 12', () => {
    expect(() =>
      runSweep(idInput, 'delay', {
        days: [0, 7, 14, 30, 60, 90, 180, 0, 7, 14, 30, 60, 90],
      }),
    ).toThrow(/too large/);
  });
});
