import { describe, expect, it } from 'vitest';
import { adjustOrder, splitFactorAfter } from '../splits';
import { computeHoldings } from '../holdings';
import { buildEpisodes, episodeDividends, episodeOrders } from '../episodes';
import { computeXirr } from '../xirr';
import { toMajorUnits } from '../pence';
import { computeDecomposition } from '../decomposition';
import { computeTwr } from '../twr';
import { computeReplay } from '../replay';
import { computePositionReturn, computeTrancheReturns } from '../returns';
import {
  benchmarkPrices,
  decompDividends,
  decompOrders,
  decompPrices,
  expectedDecomp,
  expectedExitEvent,
  expectedFlipTrip1Pnl,
  expectedFlipTrip1Return,
  expectedFlipTrip2Pnl,
  expectedFlipTrip2Return,
  flipDividends,
  flipOrders,
  flipPrices,
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
  synthOrdersWithDust,
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

describe('same-day flip', () => {
  const episodes = buildEpisodes(flipOrders, []);

  /** The closed-trip slice from computeClosedTrips (analysis/portfolio.ts). */
  const closedTrips = episodes
    .filter((ep) => !ep.isOpen && ep.endDate)
    .map((ep) => {
      const epOrders = episodeOrders(ep, flipOrders);
      const epDivs = episodeDividends(ep, epOrders, flipDividends);
      const posRet = computePositionReturn({
        orders: epOrders,
        splits: [],
        prices: flipPrices,
        fxRates: [],
        currency: 'GBP',
        dividends: epDivs,
        asOfDate: ep.endDate!,
      });
      return {
        start: ep.startDate,
        end: ep.endDate!,
        invested: posRet.invested,
        pnl: posRet.returned - posRet.invested,
        totalReturn: posRet.totalReturn,
        dividendIds: epDivs.map((d) => d.id),
      };
    });

  it('carries one trip through a sell and rebuy in the same second', () => {
    expect(episodes).toHaveLength(2);
    expect(episodes[0].startDate).toBe('2024-01-15');
    expect(episodes[0].endDate).toBe('2024-09-02');
    expect(episodes[0].orderIds).toEqual(['f-b1', 'f-s1', 'f-b2', 'f-s2']);
  });

  it('starts a new trip when the gap is longer than a flip', () => {
    expect(episodes[1].startDate).toBe('2024-09-20');
    expect(episodes[1].endDate).toBe('2024-11-01');
    expect(episodes[1].orderIds).toEqual(['f-b3', 'f-s3']);
  });

  it('assigns every order to exactly one episode', () => {
    const assigned = episodes.flatMap((ep) => ep.orderIds);
    expect([...assigned].sort()).toEqual(flipOrders.map((o) => o.id).sort());
  });

  it('keeps pnl and total return in agreement', () => {
    // The date-range slice put the rebuy in the closing trip, so its total
    // return counted a position the trip no longer held: +20% against −£1,000.
    for (const trip of closedTrips) {
      expect(trip.pnl).toBeCloseTo(trip.totalReturn * trip.invested, 6);
      expect(Math.sign(trip.pnl)).toBe(Math.sign(trip.totalReturn));
    }
  });

  it('values each trip over its own orders and dividends', () => {
    expect(closedTrips).toHaveLength(2);

    expect(closedTrips[0].invested).toBeCloseTo(2500, 6);
    expect(closedTrips[0].pnl).toBeCloseTo(expectedFlipTrip1Pnl, 6);
    expect(closedTrips[0].totalReturn).toBeCloseTo(expectedFlipTrip1Return, 6);
    // Only the payout made while the position was on: not the one in the gap,
    // and not the one paid hours before trip 2 opened.
    expect(closedTrips[0].dividendIds).toEqual(['f-d1']);

    expect(closedTrips[1].invested).toBeCloseTo(600, 6);
    expect(closedTrips[1].pnl).toBeCloseTo(expectedFlipTrip2Pnl, 6);
    expect(closedTrips[1].totalReturn).toBeCloseTo(expectedFlipTrip2Return, 6);
    expect(closedTrips[1].dividendIds).toEqual([]);
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
