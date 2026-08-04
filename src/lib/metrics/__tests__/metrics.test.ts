import { describe, expect, it } from 'vitest';
import { adjustOrder, splitFactorAfter } from '../splits';
import { computeHoldings } from '../holdings';
import { buildEpisodes } from '../episodes';
import { computeXirr } from '../xirr';
import { toMajorUnits } from '../pence';
import { computeDecomposition } from '../decomposition';
import { computePostExit } from '../postExit';
import { computePostBuy } from '../postBuy';
import { computeEntryContext } from '../entryContext';
import { computeTwr } from '../twr';
import { computeReplay } from '../replay';
import { computePositionReturn, computeTrancheReturns } from '../returns';
import { gbpTotalReturn } from '../window';
import type { PriceBar } from '../types';
import {
  benchmarkPrices,
  decompDividends,
  decompOrders,
  decompPrices,
  expectedDecomp,
  expectedExitEvent,
  expectedPortfolioProfit,
  expectedRealisedAfterSell,
  expectedSharesAfterSell,
  expectedSharesBeforeSell,
  expectedSplitB1,
  expectedSplitB2,
  expectedSplitS1,
  expectedTrancheEpDownReturn,
  expectedTwr,
  profitADivs,
  profitAOrders,
  profitAPrices,
  profitBOrders,
  profitBPrices,
  profitFxGbp,
  replayFlows,
  synthBuy1,
  synthBuy2,
  synthFxGbp,
  synthOrders,
  synthPrices,
  synthSell1,
  synthSellDust2,
  synthSplits,
  trancheEpFx,
  trancheEpOrders,
  trancheEpPrices,
  twrDaily,
  xirrShortSpanFlows,
  xirrSignFlipFlows,
  expectedXirrStandard,
  xirrStandardFlows,
  xirrTotalLossFlows,
} from './fixtures';

describe('split adjustment', () => {
  it('adjusts pre-split buys to current basis', () => {
    expect(adjustOrder(synthBuy1, synthSplits)).toEqual(expectedSplitB1);
    expect(adjustOrder(synthBuy2, synthSplits)).toEqual(expectedSplitB2);
  });

  it('leaves post-split orders unchanged', () => {
    expect(adjustOrder(synthSell1, synthSplits)).toEqual(expectedSplitS1);
  });

  it('computes split factor after order date', () => {
    expect(splitFactorAfter('2024-01-15', synthSplits)).toBe(2);
    expect(splitFactorAfter('2024-04-10', synthSplits)).toBe(1);
  });
});

describe('holdings & dust', () => {
  it('tracks shares and realised bookkeeping through partial exit', () => {
    const result = computeHoldings({
      orders: synthOrders,
      splits: synthSplits,
      prices: synthPrices,
      fxRates: synthFxGbp,
      currency: 'GBP',
      asOfDate: '2024-04-10',
    });

    const beforeSell = result.daily.find((d) => d.date === '2024-03-01');
    expect(beforeSell?.shares).toBeCloseTo(expectedSharesBeforeSell, 6);

    const afterSell = result.daily.find((d) => d.date === '2024-04-10');
    expect(afterSell).toBeDefined();
    expect(afterSell!.shares).toBeCloseTo(expectedSharesAfterSell, 6);
    expect(afterSell!.realisedPnLGbp).toBeCloseTo(expectedRealisedAfterSell, 6);
  });

  it('zeroes fractional dust below threshold', () => {
    const orders = [synthBuy1, synthBuy2, synthSell1, synthSellDust2];
    const result = computeHoldings({
      orders,
      splits: synthSplits,
      prices: synthPrices,
      fxRates: synthFxGbp,
      currency: 'GBP',
      asOfDate: '2024-05-02',
    });

    const last = result.daily[result.daily.length - 1];
    expect(last.shares).toBe(0);
  });
});

describe('episodes & exit events', () => {
  it('builds one open episode with a single exit event', () => {
    const episodes = buildEpisodes(synthOrders, synthSplits);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].isOpen).toBe(true);
    expect(episodes[0].startDate).toBe('2024-01-15');
    expect(episodes[0].exitEvents).toHaveLength(1);

    const exit = episodes[0].exitEvents[0];
    expect(exit.shares).toBeCloseTo(expectedExitEvent.shares, 6);
    expect(exit.proceedsGbp).toBeCloseTo(expectedExitEvent.proceedsGbp, 6);
    expect(exit.avgPriceLocal).toBeCloseTo(expectedExitEvent.avgPriceLocal, 6);
    expect(exit.date).toBe(expectedExitEvent.date);
  });

  it('closes episode when dust zeroes holdings', () => {
    const orders = [synthBuy1, synthBuy2, synthSell1, synthSellDust2];
    const episodes = buildEpisodes(orders, synthSplits);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].isOpen).toBe(false);
    expect(episodes[0].endDate).toBe('2024-05-02');
  });
});

describe('XIRR', () => {
  it('computes standard case', () => {
    const result = computeXirr(xirrStandardFlows);
    expect(result.totalReturn).toBeCloseTo(0.1, 6);
    expect(result.suppressAnnualised).toBe(false);
    expect(result.xirr).toBeCloseTo(expectedXirrStandard, 4);
  });

  it('handles sign-flip cash flows', () => {
    const result = computeXirr(xirrSignFlipFlows);
    expect(result.totalReturn).toBeCloseTo(0.2, 6);
    expect(result.xirr).not.toBeNull();
    expect(result.xirr!).toBeGreaterThan(0);
  });

  it('returns -1 for total loss', () => {
    const result = computeXirr(xirrTotalLossFlows);
    expect(result.xirr).toBe(-1);
    expect(result.totalReturn).toBe(-1);
  });

  it('sets suppressAnnualised when span < 182 days', () => {
    const result = computeXirr(xirrShortSpanFlows);
    expect(result.totalReturn).toBeCloseTo(0.05, 6);
    expect(result.suppressAnnualised).toBe(true);
    expect(result.xirr).not.toBeNull();
  });
});

describe('pence conversion', () => {
  it('converts GBX to major units', () => {
    expect(toMajorUnits(1234, 'GBX')).toBe(12.34);
  });

  it('converts GBp to major units', () => {
    expect(toMajorUnits(1234, 'GBp')).toBe(12.34);
  });

  it('leaves GBP unchanged', () => {
    expect(toMajorUnits(12.34, 'GBP')).toBe(12.34);
  });
});

describe('decomposition', () => {
  it('sums price + dividends + FX exactly to total profit', () => {
    const result = computeDecomposition({
      orders: decompOrders,
      splits: [],
      prices: decompPrices,
      fxRates: [{ date: '2024-01-01', ccy: 'GBP', gbpPerUnit: 1 }],
      currency: 'GBP',
      dividends: decompDividends,
      asOfDate: '2024-06-01',
    });

    expect(result.priceGbp).toBeCloseTo(expectedDecomp.priceGbp, 6);
    expect(result.dividendsGbp).toBeCloseTo(expectedDecomp.dividendsGbp, 6);
    expect(result.fxGbp).toBeCloseTo(expectedDecomp.fxGbp, 6);
    expect(result.totalGbp).toBeCloseTo(expectedDecomp.totalGbp, 6);
    expect(result.priceGbp + result.dividendsGbp + result.fxGbp).toBeCloseTo(
      result.totalGbp,
      10,
    );
  });
});

describe('TWR', () => {
  it('chain-links daily returns indexed to 100', () => {
    const points = computeTwr(twrDaily);
    expect(points).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(points[i].date).toBe(expectedTwr[i].date);
      expect(points[i].index).toBeCloseTo(expectedTwr[i].index, 6);
      expect(points[i].dailyReturn).toBeCloseTo(expectedTwr[i].dailyReturn, 6);
    }
  });

  it('does not turn a large contribution into performance', () => {
    // A £75 contribution landing on an £8.66 balance, with a real £0.45 gain.
    // Dividing by the opening balance alone would report +5.2% for the day.
    const points = computeTwr([
      { date: '2025-08-29', securitiesValue: 8.66, buysGbp: 8.71, sellsGbp: 0, dividendsGbp: 0 },
      { date: '2025-09-01', securitiesValue: 84.47, buysGbp: 75.36, sellsGbp: 0, dividendsGbp: 0 },
    ]);
    expect(points[1]!.dailyReturn).toBeCloseTo(0.45 / 84.02, 4);
    expect(points[1]!.index).toBeLessThan(101);
  });

  it('survives a full liquidation and rebuy without zeroing the index', () => {
    // Selling out must not read as -100%: the position was closed, not lost.
    const points = computeTwr([
      { date: '2026-06-17', securitiesValue: 28.68, buysGbp: 0, sellsGbp: 0, dividendsGbp: 0 },
      { date: '2026-06-18', securitiesValue: 0, buysGbp: 0, sellsGbp: 28.68, dividendsGbp: 0 },
      { date: '2026-06-19', securitiesValue: 0, buysGbp: 0, sellsGbp: 0, dividendsGbp: 0 },
      { date: '2026-07-20', securitiesValue: 8.4, buysGbp: 8.4, sellsGbp: 0, dividendsGbp: 0 },
      { date: '2026-07-21', securitiesValue: 8.5, buysGbp: 0, sellsGbp: 0, dividendsGbp: 0 },
    ]);
    expect(points[1]!.dailyReturn).toBeCloseTo(0, 10);
    expect(points[1]!.index).toBeCloseTo(100, 10);
    // The index picks the position back up rather than staying dead at zero.
    expect(points[4]!.index).toBeGreaterThan(100);
  });

  it('leaves a day with no external flow on the plain value ratio', () => {
    const points = computeTwr([
      { date: '2024-03-01', securitiesValue: 200, buysGbp: 200, sellsGbp: 0, dividendsGbp: 0 },
      { date: '2024-03-02', securitiesValue: 210, buysGbp: 0, sellsGbp: 0, dividendsGbp: 0 },
    ]);
    expect(points[1]!.dailyReturn).toBeCloseTo(0.05, 10);
  });

  it('counts dividends as return, not as capital', () => {
    // £2 of dividend on a £100 book that ends flat is a 2% day.
    const points = computeTwr([
      { date: '2024-04-01', securitiesValue: 100, buysGbp: 100, sellsGbp: 0, dividendsGbp: 0 },
      { date: '2024-04-02', securitiesValue: 100, buysGbp: 0, sellsGbp: 0, dividendsGbp: 2 },
    ]);
    expect(points[1]!.dailyReturn).toBeCloseTo(0.02, 10);
  });
});

describe('replay', () => {
  it('computes replay XIRR and picking edge', () => {
    const result = computeReplay(replayFlows, benchmarkPrices);
    expect(result.replayXirr).not.toBeNull();
    expect(result.pickingEdge).not.toBeNull();
    // Actual total return = (500+600-1000)/1000 = 0.10
    expect(result.replayTotalReturn).toBeGreaterThan(0);
  });

  it('measures the index, not a copy of the actual result', () => {
    // £1,000 in at 100, terminal value only — the index rose 100 → 120, so the
    // replay must return +20%, regardless of what the real portfolio did.
    const external = [{ date: '2024-01-01', amountGbp: -1000 }];
    const actual = [
      { date: '2024-01-01', amountGbp: -1000 },
      // The real portfolio doubled; the index did not.
      { date: '2024-12-01', amountGbp: 2000 },
    ];
    const result = computeReplay(actual, benchmarkPrices, {
      externalFlows: external,
      asOfDate: '2024-12-01',
    });
    expect(result.replayTotalReturn).toBeCloseTo(0.2, 6);
    // Beating the index by that much must show up as a clearly positive edge.
    expect(result.pickingEdge).not.toBeNull();
    expect(result.pickingEdge!).toBeGreaterThan(0.5);
  });

  it('reports a negative edge when the index wins', () => {
    const external = [{ date: '2024-01-01', amountGbp: -1000 }];
    const actual = [
      { date: '2024-01-01', amountGbp: -1000 },
      // Real portfolio ended flat while the index gained 20%.
      { date: '2024-12-01', amountGbp: 1000 },
    ];
    const result = computeReplay(actual, benchmarkPrices, {
      externalFlows: external,
      asOfDate: '2024-12-01',
    });
    expect(result.pickingEdge).not.toBeNull();
    expect(result.pickingEdge!).toBeLessThan(0);
  });
});

describe('tranche returns', () => {
  it('resets average cost per episode and values closed tranches at exit', () => {
    // Hand check: buy 100@10 (base) → buy 50@8 (down vs avg 10) → sell all@12 → buy 10@20 (new base).
    // Closed-episode tranche: capital £400, value at exit close 12 → 50×12=£600, return = 0.5.
    // Today's close is 30 — must not be used. Re-entry @20 is base, not a tranche.
    const episodes = buildEpisodes(trancheEpOrders, []);
    expect(episodes).toHaveLength(2);

    const result = computeTrancheReturns({
      orders: trancheEpOrders,
      splits: [],
      prices: trancheEpPrices,
      fxRates: trancheEpFx,
      currency: 'GBP',
      episodes,
      asOfDate: '2024-06-01',
    });

    expect(result.tranches).toHaveLength(1);
    expect(result.tranches[0]!.trancheId).toBe('te-b2');
    expect(result.tranches[0]!.classification).toBe('down');
    expect(result.tranches[0]!.totalReturn).toBeCloseTo(expectedTrancheEpDownReturn, 6);
    expect(result.down.count).toBe(1);
    expect(result.down.capitalGbp).toBeCloseTo(400, 6);
    expect(result.down.totalReturn).toBeCloseTo(expectedTrancheEpDownReturn, 6);
    expect(result.up.count).toBe(0);
  });
});

describe('post-exit annualised', () => {
  // Sold 2024-01-01; two years later the stock has doubled and the index is up 21%.
  const exitEvent = {
    date: '2024-01-01',
    shares: 10,
    proceedsGbp: 1000,
    avgPriceLocal: 100,
    orderIds: ['pe-s1'],
  };
  const prices = [
    { date: '2024-01-01', closeLocal: 100 },
    { date: '2024-03-01', closeLocal: 120 },
    { date: '2025-12-31', closeLocal: 200 },
  ];
  const bench = [
    { date: '2024-01-01', closeLocal: 100 },
    { date: '2024-03-01', closeLocal: 105 },
    { date: '2025-12-31', closeLocal: 121 },
  ];
  const fx = [{ date: '2024-01-01', ccy: 'GBP', gbpPerUnit: 1 }];
  const input = {
    exitEvent,
    prices,
    dividends: [],
    fxRates: fx,
    currency: 'GBP',
    benchmarkPrices: bench,
    benchmarkFxRates: fx,
    benchmarkCurrency: 'GBP',
    tradingDates: prices.map((p) => p.date),
  };

  it('compounds the whole window to a yearly rate, net of the index', () => {
    // 730 days ≈ 1.9986 years: +100% raw → ~+41.5%/yr, index +21% → ~+9.9%/yr.
    const result = computePostExit({ ...input, asOfDate: '2026-01-05' });

    expect(result.endDate).toBe('2025-12-31');
    expect(result.rawAnnualised).toBeCloseTo(2 ** (365.25 / 730) - 1, 6);
    expect(result.adjAnnualised).toBeCloseTo(
      2 ** (365.25 / 730) - 1 - (1.21 ** (365.25 / 730) - 1),
      6,
    );
  });

  it('reports nothing until the window is long enough to annualise', () => {
    const result = computePostExit({ ...input, asOfDate: '2024-03-05' });

    expect(result.windowDays).toBe(60);
    expect(result.rawAnnualised).toBeNull();
    expect(result.adjAnnualised).toBeNull();
  });
});

describe('one profit metric', () => {
  it('sums position profit to sells − buys + dividends + market value', () => {
    // Hand check (fixtures.ts): A = 37, B = 9, Σ = 46.
    const asOf = '2024-06-01';
    const positions = [
      computePositionReturn({
        orders: profitAOrders,
        splits: [],
        prices: profitAPrices,
        fxRates: profitFxGbp,
        currency: 'GBP',
        dividends: profitADivs,
        asOfDate: asOf,
      }),
      computePositionReturn({
        orders: profitBOrders,
        splits: [],
        prices: profitBPrices,
        fxRates: profitFxGbp,
        currency: 'GBP',
        dividends: [],
        asOfDate: asOf,
      }),
    ];

    const sumProfit = positions.reduce(
      (s, p) => s + (p.returned + p.openValue - p.invested),
      0,
    );
    const allOrders = [...profitAOrders, ...profitBOrders];
    const sumSells = allOrders
      .filter((o) => o.side === 'SELL')
      .reduce((s, o) => s + o.totalGbp - o.feesGbp, 0);
    const sumBuys = allOrders
      .filter((o) => o.side === 'BUY')
      .reduce((s, o) => s + o.totalGbp + o.feesGbp, 0);
    const sumDivs = profitADivs.reduce((s, d) => s + d.amountGbp, 0);
    const sumMv = positions.reduce((s, p) => s + p.openValue, 0);

    expect(sumProfit).toBeCloseTo(expectedPortfolioProfit, 9);
    expect(sumProfit).toBeCloseTo(sumSells - sumBuys + sumDivs + sumMv, 9);
  });
});

describe('post-buy cumulative', () => {
  const flatPrices: PriceBar[] = [
    { date: '2023-01-01', closeLocal: 100 },
    { date: '2023-01-31', closeLocal: 100 },
    { date: '2023-04-01', closeLocal: 100 },
    { date: '2023-07-02', closeLocal: 100 },
    { date: '2024-01-01', closeLocal: 100 },
    { date: '2025-01-01', closeLocal: 100 },
  ];
  const fx = [{ date: '2023-01-01', ccy: 'GBP', gbpPerUnit: 1 }];
  const base = {
    buyDate: '2023-01-01',
    capitalGbp: 1000,
    shares: 10,
    prices: flatPrices,
    dividends: [] as { date: string; perShareLocal: number }[],
    fxRates: fx,
    currency: 'GBP',
    benchmarkPrices: flatPrices,
    benchmarkFxRates: fx,
    benchmarkCurrency: 'GBP',
    tradingDates: flatPrices.map((p) => p.date),
  };

  it('flat price + flat benchmark → adj 0 at every matured horizon', () => {
    const result = computePostBuy({ ...base, asOfDate: '2025-01-05' });
    for (const pt of result.points) {
      expect(pt.matured).toBe(true);
      expect(pt.raw).toBeCloseTo(0, 9);
      expect(pt.adj).toBeCloseTo(0, 9);
    }
  });

  it('immature horizon → matured false, adj null, excluded from aggregate n', () => {
    // 60 days after buy: 30d matured, 90d+ not.
    const result = computePostBuy({ ...base, asOfDate: '2023-03-02' });
    const h30 = result.points.find((p) => p.horizonDays === 30)!;
    const h90 = result.points.find((p) => p.horizonDays === 90)!;
    expect(h30.matured).toBe(true);
    expect(h30.adj).not.toBeNull();
    expect(h90.matured).toBe(false);
    expect(h90.adj).toBeNull();
    expect(h90.raw).toBeNull();

    const matured = result.points.filter((p) => p.matured && p.adj != null);
    expect(matured).toHaveLength(1);
    expect(matured[0]!.horizonDays).toBe(30);
  });

  it('uses the split-adjusted share count passed in', () => {
    // Price doubles over a year; 20 adj shares vs 10 raw would 2× capital return
    // if we incorrectly used raw — here we assert the return is independent of
    // the share count (it's a ratio) but gbpTotalReturn scales with shares on
    // absolute terms. Check that doubling shares leaves the return unchanged.
    const prices: PriceBar[] = [
      { date: '2023-01-01', closeLocal: 100 },
      { date: '2024-01-01', closeLocal: 200 },
    ];
    const input = {
      ...base,
      prices,
      benchmarkPrices: prices,
      tradingDates: prices.map((p) => p.date),
      asOfDate: '2024-01-05',
    };
    const a = computePostBuy({ ...input, shares: 10 });
    const b = computePostBuy({ ...input, shares: 20 });
    const ptA = a.points.find((p) => p.horizonDays === 365)!;
    const ptB = b.points.find((p) => p.horizonDays === 365)!;
    expect(ptA.raw).toBeCloseTo(1, 6);
    expect(ptB.raw).toBeCloseTo(1, 6);
    expect(ptA.adj).toBeCloseTo(0, 6);
  });
});

describe('entry context', () => {
  it('ignores a spike on the buy date (no look-ahead)', () => {
    const prior: PriceBar[] = [];
    for (let i = 0; i < 260; i++) {
      const d = new Date(Date.UTC(2022, 0, 1 + i));
      prior.push({
        date: d.toISOString().slice(0, 10),
        closeLocal: 100 + (i % 5),
      });
    }
    const buyDate = '2023-01-01';
    const baseline = computeEntryContext(buyDate, prior);
    const withSpike: PriceBar[] = [
      ...prior,
      { date: buyDate, closeLocal: 50_000 },
    ];
    expect(computeEntryContext(buyDate, withSpike)).toEqual(baseline);
  });

  it('returns nulls when history is insufficient', () => {
    const prices: PriceBar[] = [
      { date: '2024-01-01', closeLocal: 100 },
      { date: '2024-01-02', closeLocal: 101 },
    ];
    const ctx = computeEntryContext('2024-01-03', prices);
    expect(ctx.pctFrom52wHigh).toBeNull();
    expect(ctx.trailing3mReturn).toBeNull();
    expect(ctx.pctFrom200dma).toBeNull();
  });

  it('hand-computes the 200dma on a known series', () => {
    const prices: PriceBar[] = [];
    for (let i = 0; i < 200; i++) {
      // closes 1, 2, …, 200
      const d = new Date(Date.UTC(2023, 0, 1 + i));
      prices.push({ date: d.toISOString().slice(0, 10), closeLocal: i + 1 });
    }
    const buyDate = new Date(Date.UTC(2023, 0, 1 + 200)).toISOString().slice(0, 10);
    // SMA of 1..200 = 200*201/2 / 200 = 100.5; closeNow = 200
    // pct = (200 - 100.5) / 100.5
    const ctx = computeEntryContext(buyDate, prices);
    expect(ctx.pctFrom200dma).toBeCloseTo((200 - 100.5) / 100.5, 9);
  });
});

describe('gbpTotalReturn extraction', () => {
  it('matches the window helper used by postExit (flat → 0)', () => {
    const prices = [
      { date: '2024-01-01', closeLocal: 50 },
      { date: '2024-06-01', closeLocal: 50 },
    ];
    const fx = [{ date: '2024-01-01', ccy: 'GBP', gbpPerUnit: 1 }];
    expect(
      gbpTotalReturn('2024-01-01', '2024-06-01', prices, [], fx, 'GBP', 10),
    ).toBeCloseTo(0, 9);
  });
});
