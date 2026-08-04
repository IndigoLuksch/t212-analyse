/**
 * Synthetic fixtures with hand-computed expected values.
 *
 * Instrument: SYNTH.L (GBP)
 * - 2:1 split on 2024-03-01
 * - Staggered buys, partial exit, dividends
 *
 * Instrument: USDX (USD) with moving FX
 */

import type {
  CashFlow,
  DivEvent,
  DividendCash,
  FxRate,
  Order,
  PriceBar,
  Split,
} from '../types';

export const SYNTH_TICKER = 'SYNTH.L';

export const synthSplit: Split = {
  date: '2024-03-01',
  numerator: 2,
  denominator: 1,
};

export const synthSplits: Split[] = [synthSplit];

/** BUY 10 @ £100 pre-split → adj 20 @ £50 */
export const synthBuy1: Order = {
  id: 'b1',
  t212Ticker: SYNTH_TICKER,
  side: 'BUY',
  executedAt: '2024-01-15T12:00:00.000Z',
  quantity: 10,
  fillPriceLocal: 100,
  totalGbp: 1000,
  feesGbp: 1,
};

/** BUY 5 @ £110 pre-split → adj 10 @ £55 */
export const synthBuy2: Order = {
  id: 'b2',
  t212Ticker: SYNTH_TICKER,
  side: 'BUY',
  executedAt: '2024-02-15T12:00:00.000Z',
  quantity: 5,
  fillPriceLocal: 110,
  totalGbp: 550,
  feesGbp: 1,
};

/** SELL 15 @ £60 post-split (current basis) */
export const synthSell1: Order = {
  id: 's1',
  t212Ticker: SYNTH_TICKER,
  side: 'SELL',
  executedAt: '2024-04-10T12:00:00.000Z',
  quantity: 15,
  fillPriceLocal: 60,
  totalGbp: 900,
  feesGbp: 1,
};

/** SELL leaving dust: 14.996 shares from 15 remaining → dust zeroes */
export const synthSellDust: Order = {
  id: 's2',
  t212Ticker: SYNTH_TICKER,
  side: 'SELL',
  executedAt: '2024-05-01T12:00:00.000Z',
  quantity: 14.996,
  fillPriceLocal: 62,
  totalGbp: 929.752,
  feesGbp: 0,
};

export const synthOrders: Order[] = [synthBuy1, synthBuy2, synthSell1];

export const synthOrdersWithDust: Order[] = [
  synthBuy1,
  synthBuy2,
  synthSell1,
  synthSellDust,
];

export const synthPrices: PriceBar[] = [
  { date: '2024-01-15', closeLocal: 100 },
  { date: '2024-02-15', closeLocal: 108 },
  { date: '2024-03-01', closeLocal: 54 }, // post-split equivalent
  { date: '2024-04-10', closeLocal: 60 },
  { date: '2024-05-01', closeLocal: 62 },
  { date: '2024-06-01', closeLocal: 65 },
];

export const synthDividends: DivEvent[] = [
  { date: '2024-04-20', perShareLocal: 1 },
];

export const synthDividendCash: DividendCash[] = [
  {
    id: 'd1',
    t212Ticker: SYNTH_TICKER,
    paidAt: '2024-04-20T12:00:00.000Z',
    amountGbp: 25, // 25 shares held × £1 on ex-date after first sell
  },
];

export const synthFxGbp: FxRate[] = [
  { date: '2024-01-01', ccy: 'GBP', gbpPerUnit: 1 },
];

// --- Split adjustment expected ---
// b1 date 2024-01-15, split 2024-03-01 after → factor 2
// adjQty = 10 × 2 = 20, adjPrice = 100 / 2 = 50
export const expectedSplitB1 = { adjQty: 20, adjPrice: 50 };

// b2 date 2024-02-15, factor 2
// adjQty = 5 × 2 = 10, adjPrice = 110 / 2 = 55
export const expectedSplitB2 = { adjQty: 10, adjPrice: 55 };

// s1 date 2024-04-10, no splits after → factor 1
// adjQty = 15, adjPrice = 60
export const expectedSplitS1 = { adjQty: 15, adjPrice: 60 };

// --- Holdings after b1+b2, before sell ---
// shares = 20 + 10 = 30
// cost: (1000+1) + (550+1) = 1552
// avgCostGbp = 1552/30 ≈ 51.7333...
export const expectedSharesBeforeSell = 30;

// After sell 15: shares = 15, proceeds = 899
// avg cost removed = 15 × (1552/30) = 776
// realised = 899 - 776 = 123
export const expectedSharesAfterSell = 15;
export const expectedRealisedAfterSell = 123;

// --- Exit event (single sell, no merge needed) ---
// shares=15, proceeds=899, avgPriceLocal=60
export const expectedExitEvent = {
  shares: 15,
  proceedsGbp: 899,
  avgPriceLocal: 60,
  date: '2024-04-10',
};

// --- Dust: after sell1 shares=15, peak=30, threshold=max(1e-6,0.003)=0.003
// sell 14.996 → 0.004 remaining, NOT dust
// need sell 14.997 → 0.003 remaining = dust → 0
/** Leaves 0.0025 shares < dust threshold 0.003 (peak 30) */
export const synthSellDust2: Order = {
  id: 's3',
  t212Ticker: SYNTH_TICKER,
  side: 'SELL',
  executedAt: '2024-05-02T12:00:00.000Z',
  quantity: 14.9975,
  fillPriceLocal: 62,
  totalGbp: 929.845,
  feesGbp: 0,
};

// --- XIRR fixtures ---
// Standard: invest 1000, return 1100 after ~1 year
export const xirrStandardFlows: CashFlow[] = [
  { date: '2023-01-01', amountGbp: -1000 },
  { date: '2024-01-01', amountGbp: 1100 },
];
// totalReturn = 0.10, span 365d, suppress=false
// xirr: solve 1100/(1+r)^(365/365.25)=1000 → r ≈ 0.100072
export const expectedXirrStandard = 0.100072;

export const xirrSignFlipFlows: CashFlow[] = [
  { date: '2024-01-01', amountGbp: -1000 },
  { date: '2024-06-01', amountGbp: 400 },
  { date: '2024-12-01', amountGbp: 800 },
];
// totalReturn = (1200-1000)/1000 = 0.20

export const xirrTotalLossFlows: CashFlow[] = [
  { date: '2024-01-01', amountGbp: -1000 },
  { date: '2024-06-01', amountGbp: 0 },
];
// xirr = -1, totalReturn = -1

export const xirrShortSpanFlows: CashFlow[] = [
  { date: '2024-01-01', amountGbp: -1000 },
  { date: '2024-03-01', amountGbp: 1050 },
];
// span 60 days < 182, suppressAnnualised = true
// totalReturn = 0.05

// --- Decomposition (simple, no sells) ---
export const decompOrders: Order[] = [
  {
    id: 'db1',
    t212Ticker: 'SIMPLE',
    side: 'BUY',
    executedAt: '2024-01-01T00:00:00Z',
    quantity: 10,
    fillPriceLocal: 10,
    totalGbp: 100,
    feesGbp: 0,
  },
];

export const decompPrices: PriceBar[] = [
  { date: '2024-01-01', closeLocal: 10 },
  { date: '2024-06-01', closeLocal: 12 },
];

// close=12, shares=10, invested=100, open=120, div=5
// total = 120+5-100 = 25
// price = (12-10)*10*1 = 20
// div = 5
// fx = 0
export const decompDividends: DividendCash[] = [
  {
    id: 'dd1',
    t212Ticker: 'SIMPLE',
    paidAt: '2024-03-01T00:00:00Z',
    amountGbp: 5,
  },
];

export const expectedDecomp = {
  priceGbp: 20,
  dividendsGbp: 5,
  fxGbp: 0,
  totalGbp: 25,
};

// --- TWR ---
// Day1: V=0, buy 100 → V=100, index=100
// Each day divides by the capital exposed that day: prevValue + buys.
// Day1: no prior value → index starts at 100.
// Day2: V=110, no flow → r=(110-100)/100=0.1, index=110.
// Day3: V=55 after selling 50 → the £110 was exposed until the sale → r=-5/110.
export const twrDaily = [
  { date: '2024-01-01', securitiesValue: 100, buysGbp: 100, sellsGbp: 0, dividendsGbp: 0 },
  { date: '2024-01-02', securitiesValue: 110, buysGbp: 0, sellsGbp: 0, dividendsGbp: 0 },
  { date: '2024-01-03', securitiesValue: 55, buysGbp: 0, sellsGbp: 50, dividendsGbp: 0 },
];

export const expectedTwr = [
  { date: '2024-01-01', index: 100, dailyReturn: 0 },
  { date: '2024-01-02', index: 110, dailyReturn: 0.1 },
  { date: '2024-01-03', index: 105, dailyReturn: -5 / 110 },
];

// --- Replay benchmark ---
export const replayFlows: CashFlow[] = [
  { date: '2024-01-01', amountGbp: -1000 },
  { date: '2024-06-01', amountGbp: 500 },
  { date: '2024-12-01', amountGbp: 600 },
];

export const benchmarkPrices: PriceBar[] = [
  { date: '2024-01-01', closeLocal: 100 },
  { date: '2024-06-01', closeLocal: 110 },
  { date: '2024-12-01', closeLocal: 120 },
];

// --- USD instrument ---
export const USDX_TICKER = 'USDX';

export const usdFxRates: FxRate[] = [
  { date: '2024-01-01', ccy: 'USD', gbpPerUnit: 0.8 },
  { date: '2024-06-01', ccy: 'USD', gbpPerUnit: 0.75 },
];

export const usdPrices: PriceBar[] = [
  { date: '2024-01-01', closeLocal: 100 },
  { date: '2024-06-01', closeLocal: 110 },
];

export const usdBuy: Order = {
  id: 'ub1',
  t212Ticker: USDX_TICKER,
  side: 'BUY',
  executedAt: '2024-01-01T12:00:00Z',
  quantity: 1,
  fillPriceLocal: 100,
  totalGbp: 80,
  feesGbp: 0,
};

// Trading dates for post-exit (weekdays in April 2024)
export const tradingDatesApril2024: string[] = [];
for (let d = 1; d <= 30; d++) {
  const date = `2024-04-${String(d).padStart(2, '0')}`;
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (dow !== 0 && dow !== 6) tradingDatesApril2024.push(date);
}

// --- Tranche returns (episode reset + value at exit) ---
// buy 100 @ 10 → buy 50 @ 8 → sell all @ 12 → buy 10 @ 20
// Episode 1: base buy @ 10; tranche buy @ 8 is "down"; valued at exit close 12
//   capital = 400, valueEnd = 50*12 = 600, return = (600-400)/400 = 0.5
// Episode 2: buy @ 20 is the base (not a tranche) — must NOT be classed against ep1 avg
export const trancheEpBuy1: Order = {
  id: 'te-b1',
  t212Ticker: 'TRANCHE',
  side: 'BUY',
  executedAt: '2024-01-01T12:00:00Z',
  quantity: 100,
  fillPriceLocal: 10,
  totalGbp: 1000,
  feesGbp: 0,
};
export const trancheEpBuy2: Order = {
  id: 'te-b2',
  t212Ticker: 'TRANCHE',
  side: 'BUY',
  executedAt: '2024-02-01T12:00:00Z',
  quantity: 50,
  fillPriceLocal: 8,
  totalGbp: 400,
  feesGbp: 0,
};
export const trancheEpSell: Order = {
  id: 'te-s1',
  t212Ticker: 'TRANCHE',
  side: 'SELL',
  executedAt: '2024-03-01T12:00:00Z',
  quantity: 150,
  fillPriceLocal: 12,
  totalGbp: 1800,
  feesGbp: 0,
};
export const trancheEpBuy3: Order = {
  id: 'te-b3',
  t212Ticker: 'TRANCHE',
  side: 'BUY',
  executedAt: '2024-04-01T12:00:00Z',
  quantity: 10,
  fillPriceLocal: 20,
  totalGbp: 200,
  feesGbp: 0,
};
export const trancheEpOrders: Order[] = [
  trancheEpBuy1,
  trancheEpBuy2,
  trancheEpSell,
  trancheEpBuy3,
];
export const trancheEpPrices: PriceBar[] = [
  { date: '2024-01-01', closeLocal: 10 },
  { date: '2024-02-01', closeLocal: 8 },
  { date: '2024-03-01', closeLocal: 12 },
  { date: '2024-04-01', closeLocal: 20 },
  { date: '2024-06-01', closeLocal: 30 }, // today's close — must NOT be used for closed ep tranche
];
export const trancheEpFx: FxRate[] = [
  { date: '2024-01-01', ccy: 'GBP', gbpPerUnit: 1 },
];
export const expectedTrancheEpDownReturn = 0.5;

// --- One profit metric (W8): portfolio of two GBP instruments ---
// A: buy 10@£10 (£100), sell 4@£15 (£60), div £5, hold 6@£12 → MV £72
//    profit = 60 − 100 + 5 + 72 = 37
// B: buy 5@£20 (£100+£1 fee), hold 5@£22 → MV £110
//    profit = 0 − 101 + 0 + 110 = 9
// Σ profit = 46 = Σ sells − Σ buys + Σ divs + Σ MV
export const profitAOrders: Order[] = [
  {
    id: 'pa-b1',
    t212Ticker: 'PROFIT.A',
    side: 'BUY',
    executedAt: '2024-01-01T12:00:00Z',
    quantity: 10,
    fillPriceLocal: 10,
    totalGbp: 100,
    feesGbp: 0,
  },
  {
    id: 'pa-s1',
    t212Ticker: 'PROFIT.A',
    side: 'SELL',
    executedAt: '2024-03-01T12:00:00Z',
    quantity: 4,
    fillPriceLocal: 15,
    totalGbp: 60,
    feesGbp: 0,
  },
];
export const profitAPrices: PriceBar[] = [
  { date: '2024-01-01', closeLocal: 10 },
  { date: '2024-03-01', closeLocal: 15 },
  { date: '2024-06-01', closeLocal: 12 },
];
export const profitADivs: DividendCash[] = [
  {
    id: 'pa-d1',
    t212Ticker: 'PROFIT.A',
    paidAt: '2024-04-01T12:00:00Z',
    amountGbp: 5,
  },
];
export const profitBOrders: Order[] = [
  {
    id: 'pb-b1',
    t212Ticker: 'PROFIT.B',
    side: 'BUY',
    executedAt: '2024-02-01T12:00:00Z',
    quantity: 5,
    fillPriceLocal: 20,
    totalGbp: 100,
    feesGbp: 1,
  },
];
export const profitBPrices: PriceBar[] = [
  { date: '2024-02-01', closeLocal: 20 },
  { date: '2024-06-01', closeLocal: 22 },
];
export const profitFxGbp: FxRate[] = [
  { date: '2024-01-01', ccy: 'GBP', gbpPerUnit: 1 },
];
export const expectedPortfolioProfit = 46;
