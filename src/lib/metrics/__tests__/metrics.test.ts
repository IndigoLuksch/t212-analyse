import { describe, expect, it } from 'vitest';
import { adjustOrder, splitFactorAfter } from '../splits';
import { computeHoldings } from '../holdings';
import { buildEpisodes } from '../episodes';
import { computeXirr } from '../xirr';
import { toMajorUnits } from '../pence';
import { computeDecomposition } from '../decomposition';
import { computeTwr } from '../twr';
import { computeReplay } from '../replay';
import {
  benchmarkPrices,
  decompDividends,
  decompOrders,
  decompPrices,
  expectedDecomp,
  expectedExitEvent,
  expectedRealisedAfterSell,
  expectedSharesAfterSell,
  expectedSharesBeforeSell,
  expectedSplitB1,
  expectedSplitB2,
  expectedSplitS1,
  expectedTwr,
  replayFlows,
  synthBuy1,
  synthBuy2,
  synthFxGbp,
  synthOrders,
  synthOrdersWithDust,
  synthPrices,
  synthSell1,
  synthSellDust2,
  synthSplits,
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
  it('tracks shares and realised P&L through partial exit', () => {
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
  it('sums price + dividends + FX exactly to total P&L', () => {
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
