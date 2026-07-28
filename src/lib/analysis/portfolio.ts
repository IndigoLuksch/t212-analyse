import {
  getAllDividends,
  getTradedInstruments,
  getAllNotes,
  getAllOrders,
  getDivEvents,
  getFx,
  getInstrument,
  getOrdersByTicker,
  getPrices,
  getSplits,
  getSyncState,
  type DividendRow,
  type InstrumentRow,
  type OrderRow,
} from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { BENCHMARK_YAHOO } from "@/lib/config";
import {
  buildEpisodes,
  computeAllocation,
  computeBuyDiscipline,
  computeDecomposition,
  computeGhost,
  computeHoldings,
  computePositionReturn,
  computePostExit,
  computeReplay,
  computeTrancheReturns,
  computeTwr,
  computeWorstPoint,
  computeXirr,
  type CashFlow,
  type DivEvent,
  type DividendCash,
  type FxRate,
  type Order,
  type PriceBar,
  type Split,
} from "@/lib/metrics";

export function ensureDb(): void {
  migrate();
}

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    t212Ticker: row.t212_ticker,
    side: row.side,
    executedAt: row.executed_at,
    quantity: row.quantity,
    fillPriceLocal: row.fill_price_local,
    totalGbp: row.total_gbp,
    feesGbp: row.fees_gbp,
  };
}

function toDivCash(row: DividendRow): DividendCash {
  return {
    id: row.id,
    t212Ticker: row.t212_ticker,
    paidAt: row.paid_at,
    amountGbp: row.amount_gbp,
  };
}

type MarketBundle = {
  prices: PriceBar[];
  splits: Split[];
  dividends: DivEvent[];
  fxRates: FxRate[];
  currency: string;
  tradingDates: string[];
};

function loadMarket(yahoo: string | null, currency: string): MarketBundle {
  const symbol = yahoo ?? "";
  const prices: PriceBar[] = symbol
    ? getPrices(symbol).map((p) => ({ date: p.date, closeLocal: p.close_local }))
    : [];
  const splits: Split[] = symbol
    ? getSplits(symbol).map((s) => ({
        date: s.date,
        numerator: s.numerator,
        denominator: s.denominator,
      }))
    : [];
  const dividends: DivEvent[] = symbol
    ? getDivEvents(symbol).map((d) => ({
        date: d.date,
        perShareLocal: d.per_share_local,
      }))
    : [];
  const ccy =
    currency === "GBp" || currency === "GBX" ? "GBP" : currency || "GBP";
  const fxRates: FxRate[] =
    ccy === "GBP"
      ? []
      : getFx(ccy).map((r) => ({
          date: r.date,
          ccy: r.ccy,
          gbpPerUnit: r.gbp_per_unit,
        }));
  return {
    prices,
    splits,
    dividends,
    fxRates,
    currency: ccy,
    tradingDates: prices.map((p) => p.date),
  };
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
    if (o.side === "BUY") {
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

function loadBenchmark(): {
  prices: PriceBar[];
  fxRates: FxRate[];
  currency: string;
  tradingDates: string[];
} {
  const prices = getPrices(BENCHMARK_YAHOO).map((p) => ({
    date: p.date,
    closeLocal: p.close_local,
  }));
  return {
    prices,
    fxRates: [],
    currency: "GBP",
    tradingDates: prices.map((p) => p.date),
  };
}

export function hasAnyData(): boolean {
  ensureDb();
  return getAllOrders().length > 0;
}

export function listSwitcherInstruments(): { ticker: string; name: string }[] {
  ensureDb();
  // Only instruments actually traded — the full T212 catalogue is ~17k entries.
  return getTradedInstruments().map((i) => ({
    ticker: i.t212_ticker,
    name: i.name ?? i.t212_ticker,
  }));
}

export function getLastSyncedAt(): string | null {
  ensureDb();
  const summary = getSyncState("last_sync_summary");
  if (summary) {
    try {
      const parsed = JSON.parse(summary) as { completedAt?: string };
      if (parsed.completedAt) return parsed.completedAt;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export type PositionSummary = {
  ticker: string;
  name: string;
  currency: string;
  colorSlot: number | null;
  yahooSymbol: string | null;
  stalePrice: boolean;
  isOpen: boolean;
  shares: number;
  avgCostGbp: number;
  avgFillLocal: number;
  valueGbp: number;
  invested: number;
  returned: number;
  pnlGbp: number;
  totalReturn: number;
  xirr: number | null;
  suppressAnnualised: boolean;
  holdYears: number;
  buyDiscipline: number | null;
  worstPoint: { date: string; drawdown: number } | null;
  dividendsGbp: number;
  decomposition: {
    priceGbp: number;
    dividendsGbp: number;
    fxGbp: number;
    totalGbp: number;
  };
  weight: number;
  pickingEdge: number | null;
};

/**
 * A position we have no prices for. Cash flows are still known exactly, so
 * report those and leave every market-derived figure null/zero with
 * `stalePrice` set — never a fabricated valuation.
 */
function cashOnlyPosition(
  inst: InstrumentRow,
  orders: Order[],
  cashDivs: DividendCash[],
  currency: string,
): PositionSummary {
  let invested = 0;
  let returned = 0;
  let shares = 0;
  for (const o of orders) {
    if (o.side === "BUY") {
      invested += o.totalGbp + o.feesGbp;
      shares += o.quantity;
    } else {
      returned += o.totalGbp - o.feesGbp;
      shares -= o.quantity;
    }
  }
  const dividendsGbp = cashDivs.reduce((s, d) => s + d.amountGbp, 0);
  returned += dividendsGbp;
  const pnlGbp = returned - invested;

  return {
    ticker: inst.t212_ticker,
    name: inst.name ?? inst.t212_ticker,
    currency: inst.currency ?? currency,
    colorSlot: inst.color_slot,
    yahooSymbol: inst.yahoo_symbol,
    stalePrice: true,
    isOpen: shares > 1e-6,
    shares: Math.max(shares, 0),
    avgCostGbp: shares > 1e-6 ? invested / shares : 0,
    avgFillLocal: 0,
    valueGbp: 0,
    invested,
    returned,
    pnlGbp,
    totalReturn: invested > 0 ? pnlGbp / invested : 0,
    xirr: null,
    suppressAnnualised: true,
    holdYears: 0,
    buyDiscipline: null,
    worstPoint: null,
    dividendsGbp,
    decomposition: {
      priceGbp: 0,
      dividendsGbp,
      fxGbp: 0,
      totalGbp: pnlGbp,
    },
    weight: 0,
    pickingEdge: null,
  };
}

function analysePosition(
  inst: InstrumentRow,
  asOf: string,
  benchmark: ReturnType<typeof loadBenchmark>,
): PositionSummary | null {
  const orders = getOrdersByTicker(inst.t212_ticker).map(toOrder);
  if (orders.length === 0) return null;

  const cashDivs = getAllDividends()
    .filter((d) => d.t212_ticker === inst.t212_ticker)
    .map(toDivCash);
  const market = loadMarket(inst.yahoo_symbol, inst.currency ?? "GBP");

  // No price history (unmapped, delisted, or a sync that hasn't reached this
  // symbol yet): report cash facts only and flag it, rather than throwing out
  // of every price-dependent metric and 500-ing the whole page.
  if (market.prices.length === 0) {
    return cashOnlyPosition(inst, orders, cashDivs, market.currency);
  }

  const holdings = computeHoldings({
    orders,
    splits: market.splits,
    prices: market.prices,
    fxRates: market.fxRates,
    currency: market.currency,
    asOfDate: asOf,
  });
  const posRet = computePositionReturn({
    orders,
    splits: market.splits,
    prices: market.prices,
    fxRates: market.fxRates,
    currency: market.currency,
    dividends: cashDivs,
    asOfDate: asOf,
  });
  const flows = positionFlows(orders, cashDivs, posRet.openValue, asOf);
  const xirr = computeXirr(flows);
  // External flows only (no terminal valuation) — the replay supplies its own
  // ending value from the index position.
  const externalFlows = positionFlows(orders, cashDivs, 0, asOf);
  const replay = benchmark.prices.length
    ? computeReplay(flows, benchmark.prices, { externalFlows, asOfDate: asOf })
    : {
        pickingEdge: null as number | null,
        suppressAnnualised: xirr.suppressAnnualised,
        replayXirr: null,
        replayTotalReturn: 0,
      };

  const bd = computeBuyDiscipline(orders, market.splits, market.prices);
  const episodes = buildEpisodes(orders, market.splits);
  const firstEp = episodes[0];
  const lastEp = episodes[episodes.length - 1];
  const worst = firstEp
    ? computeWorstPoint(
        holdings.daily,
        orders,
        firstEp.startDate,
        lastEp?.isOpen ? null : lastEp?.endDate ?? null,
      )
    : null;

  const decomp = computeDecomposition({
    orders,
    splits: market.splits,
    prices: market.prices,
    fxRates: market.fxRates,
    currency: market.currency,
    dividends: cashDivs,
    asOfDate: asOf,
  });

  const first = orders[0].executedAt.slice(0, 10);
  const end = lastEp?.isOpen
    ? asOf
    : (lastEp?.endDate ?? asOf);
  const holdYears =
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) /
    (365.25 * 86_400_000);

  const latestPriceDate = market.prices.at(-1)?.date;
  const stalePrice =
    Boolean(inst.yahoo_symbol) &&
    (!latestPriceDate ||
      (Date.parse(`${asOf}T00:00:00Z`) -
        Date.parse(`${latestPriceDate}T00:00:00Z`)) /
        86_400_000 >
        5);

  return {
    ticker: inst.t212_ticker,
    name: inst.name ?? inst.t212_ticker,
    currency: inst.currency ?? market.currency,
    colorSlot: inst.color_slot,
    yahooSymbol: inst.yahoo_symbol,
    stalePrice,
    isOpen: holdings.currentShares > 0,
    shares: holdings.currentShares,
    avgCostGbp: holdings.avgCostGbp,
    avgFillLocal: holdings.avgFillLocal,
    valueGbp: posRet.openValue,
    invested: posRet.invested,
    returned: posRet.returned,
    pnlGbp: posRet.returned + posRet.openValue - posRet.invested,
    totalReturn: posRet.totalReturn,
    xirr: xirr.xirr,
    suppressAnnualised: xirr.suppressAnnualised,
    holdYears,
    buyDiscipline: bd.ratio,
    worstPoint: worst,
    dividendsGbp: cashDivs.reduce((s, d) => s + d.amountGbp, 0),
    decomposition: decomp,
    weight: 0,
    pickingEdge: replay.pickingEdge,
  };
}

export function computePortfolio() {
  ensureDb();
  const asOf = new Date().toISOString().slice(0, 10);
  const instruments = getTradedInstruments();
  const benchmark = loadBenchmark();

  const positions: PositionSummary[] = [];
  for (const inst of instruments) {
    if (getOrdersByTicker(inst.t212_ticker).length === 0) continue;
    const p = analysePosition(inst, asOf, benchmark);
    if (p) positions.push(p);
  }

  const openValue = positions.reduce((s, p) => s + p.valueGbp, 0);
  for (const p of positions) {
    p.weight = openValue > 0 && p.isOpen ? p.valueGbp / openValue : 0;
  }

  const allOrders = getAllOrders().map(toOrder);
  const allDivs = getAllDividends().map(toDivCash);
  const portfolioFlows = positionFlows(allOrders, allDivs, openValue, asOf);
  const portfolioXirr = computeXirr(portfolioFlows);
  const portfolioExternalFlows = positionFlows(allOrders, allDivs, 0, asOf);
  const portfolioReplay = benchmark.prices.length
    ? computeReplay(portfolioFlows, benchmark.prices, {
        externalFlows: portfolioExternalFlows,
        asOfDate: asOf,
      })
    : {
        pickingEdge: null as number | null,
        replayXirr: null,
        suppressAnnualised: true,
        replayTotalReturn: 0,
      };

  const invested = positions.reduce((s, p) => s + p.invested, 0);
  const returned = positions.reduce((s, p) => s + p.returned, 0);
  const pnlGbp = returned + openValue - invested;
  const totalReturn = invested > 0 ? pnlGbp / invested : 0;
  const dividendsGbp = allDivs.reduce((s, d) => s + d.amountGbp, 0);

  const closedTrips: Array<{
    ticker: string;
    name: string;
    start: string;
    end: string;
    invested: number;
    pnl: number;
    totalReturn: number;
    xirr: number | null;
    suppressAnnualised: boolean;
    holdYears: number;
    worstPoint: { date: string; drawdown: number } | null;
    buyDiscipline: number | null;
  }> = [];

  for (const inst of instruments) {
    const orders = getOrdersByTicker(inst.t212_ticker).map(toOrder);
    if (!orders.length) continue;
    const market = loadMarket(inst.yahoo_symbol, inst.currency ?? "GBP");
    const holdings = computeHoldings({
      orders,
      splits: market.splits,
      prices: market.prices,
      fxRates: market.fxRates,
      currency: market.currency,
      asOfDate: asOf,
    });
    const episodes = buildEpisodes(orders, market.splits);
    for (const ep of episodes) {
      if (ep.isOpen || !ep.endDate) continue;
      const epOrders = orders.filter((o) => {
        const d = o.executedAt.slice(0, 10);
        return d >= ep.startDate && d <= ep.endDate!;
      });
      const epDivs = allDivs.filter((d) => {
        if (d.t212Ticker !== inst.t212_ticker) return false;
        const dt = d.paidAt.slice(0, 10);
        return dt >= ep.startDate && dt <= ep.endDate!;
      });
      const posRet = computePositionReturn({
        orders: epOrders,
        splits: market.splits,
        prices: market.prices,
        fxRates: market.fxRates,
        currency: market.currency,
        dividends: epDivs,
        asOfDate: ep.endDate,
      });
      const flows = positionFlows(epOrders, epDivs, 0, ep.endDate);
      const xirr = computeXirr(flows);
      const bd = computeBuyDiscipline(epOrders, market.splits, market.prices);
      const worst = computeWorstPoint(
        holdings.daily,
        epOrders,
        ep.startDate,
        ep.endDate,
      );
      closedTrips.push({
        ticker: inst.t212_ticker,
        name: inst.name ?? inst.t212_ticker,
        start: ep.startDate,
        end: ep.endDate,
        invested: posRet.invested,
        pnl: posRet.returned - posRet.invested,
        totalReturn: posRet.totalReturn,
        xirr: xirr.xirr,
        suppressAnnualised: xirr.suppressAnnualised,
        holdYears:
          (Date.parse(`${ep.endDate}T00:00:00Z`) -
            Date.parse(`${ep.startDate}T00:00:00Z`)) /
          (365.25 * 86_400_000),
        worstPoint: worst,
        buyDiscipline: bd.ratio,
      });
    }
  }

  const wins = closedTrips.filter((t) => t.pnl > 0);
  const losses = closedTrips.filter((t) => t.pnl < 0);
  const winRate = closedTrips.length ? wins.length / closedTrips.length : null;
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

  const dailyByTicker = new Map<
    string,
    ReturnType<typeof computeHoldings>["daily"]
  >();
  const tickerMeta: Record<
    string,
    { name: string; colorSlot: number | null }
  > = {};

  for (const inst of instruments) {
    const orders = getOrdersByTicker(inst.t212_ticker).map(toOrder);
    if (!orders.length) continue;
    const market = loadMarket(inst.yahoo_symbol, inst.currency ?? "GBP");
    const h = computeHoldings({
      orders,
      splits: market.splits,
      prices: market.prices,
      fxRates: market.fxRates,
      currency: market.currency,
      asOfDate: asOf,
    });
    dailyByTicker.set(inst.t212_ticker, h.daily);
    tickerMeta[inst.t212_ticker] = {
      name: inst.name ?? inst.t212_ticker,
      colorSlot: inst.color_slot,
    };
  }

  const dateSet = new Set<string>();
  for (const daily of dailyByTicker.values()) {
    for (const d of daily) dateSet.add(d.date);
  }
  const dates = [...dateSet].sort();

  const valueSeries: { date: string; value: number }[] = [];
  const investedSeries: { date: string; value: number }[] = [];
  const twrDaily: Parameters<typeof computeTwr>[0] = [];
  const allocationFlat: Parameters<typeof computeAllocation>[0] = [];

  let cumInvested = 0;
  const ordersChrono = [...allOrders].sort((a, b) =>
    a.executedAt.localeCompare(b.executedAt),
  );
  let orderIdx = 0;
  const investedByDate = new Map<string, number>();
  for (const date of dates) {
    while (
      orderIdx < ordersChrono.length &&
      ordersChrono[orderIdx].executedAt.slice(0, 10) <= date
    ) {
      const o = ordersChrono[orderIdx];
      if (o.side === "BUY") cumInvested += o.totalGbp + o.feesGbp;
      else cumInvested = Math.max(0, cumInvested - (o.totalGbp - o.feesGbp));
      orderIdx++;
    }
    investedByDate.set(date, cumInvested);
  }

  const buysByDate = new Map<string, number>();
  const sellsByDate = new Map<string, number>();
  const divsByDate = new Map<string, number>();
  for (const o of allOrders) {
    const d = o.executedAt.slice(0, 10);
    if (o.side === "BUY")
      buysByDate.set(d, (buysByDate.get(d) ?? 0) + o.totalGbp + o.feesGbp);
    else sellsByDate.set(d, (sellsByDate.get(d) ?? 0) + o.totalGbp - o.feesGbp);
  }
  for (const d of allDivs) {
    const dt = d.paidAt.slice(0, 10);
    divsByDate.set(dt, (divsByDate.get(dt) ?? 0) + d.amountGbp);
  }

  for (const date of dates) {
    let total = 0;
    for (const [ticker, daily] of dailyByTicker) {
      const last = [...daily].reverse().find((x) => x.date <= date);
      const mv = last && last.shares > 0 ? last.marketValueGbp : 0;
      if (mv > 0) {
        allocationFlat.push({ date, ticker, marketValueGbp: mv });
        total += mv;
      }
    }
    valueSeries.push({ date, value: total });
    investedSeries.push({ date, value: investedByDate.get(date) ?? 0 });
    twrDaily.push({
      date,
      securitiesValue: total,
      buysGbp: buysByDate.get(date) ?? 0,
      sellsGbp: sellsByDate.get(date) ?? 0,
      dividendsGbp: divsByDate.get(date) ?? 0,
    });
  }

  const twr = computeTwr(twrDaily);
  const firstDate = dates[0];
  const benchTwr: { date: string; index: number }[] = [];
  if (firstDate && benchmark.prices.length) {
    const startPx =
      benchmark.prices.find((p) => p.date >= firstDate)?.closeLocal ??
      benchmark.prices[0].closeLocal;
    for (const p of benchmark.prices) {
      if (p.date < firstDate) continue;
      benchTwr.push({ date: p.date, index: (p.closeLocal / startPx) * 100 });
    }
  }

  const allocation = computeAllocation(allocationFlat);

  const contribution = positions
    .map((p) => ({
      ticker: p.ticker,
      name: p.name,
      colorSlot: p.colorSlot,
      pnlGbp: p.pnlGbp,
    }))
    .sort((a, b) => b.pnlGbp - a.pnlGbp);

  const grossGains = contribution
    .filter((c) => c.pnlGbp > 0)
    .reduce((s, c) => s + c.pnlGbp, 0);
  const sortedGains = contribution
    .filter((c) => c.pnlGbp > 0)
    .sort((a, b) => b.pnlGbp - a.pnlGbp);
  let topGain = 0;
  let topCount = 0;
  for (const g of sortedGains) {
    topGain += g.pnlGbp;
    topCount++;
    if (grossGains > 0 && topGain / grossGains >= 0.78) break;
    if (topCount >= 3) break;
  }
  const contributionStat =
    grossGains > 0 && sortedGains.length
      ? `${topCount} of ${positions.length} picks produced ${Math.round((topGain / grossGains) * 100)}% of gross gains.`
      : null;

  const scatter = positions
    .filter((p) => !p.suppressAnnualised && p.xirr != null)
    .map((p) => ({
      ticker: p.ticker,
      name: p.name,
      years: p.holdYears,
      xirr: p.xirr!,
      capital: p.invested,
      isOpen: p.isOpen,
      colorSlot: p.colorSlot,
    }));

  const realisedClosed = closedTrips.reduce((s, t) => s + t.pnl, 0);

  return {
    asOf,
    hero: {
      pnlGbp,
      totalReturn,
      xirr: portfolioXirr.xirr,
      suppressAnnualised: portfolioXirr.suppressAnnualised,
      pickingEdge: portfolioReplay.pickingEdge,
      replayXirr: portfolioReplay.replayXirr,
    },
    kpis: {
      currentValue: openValue,
      invested,
      realisedPnL: realisedClosed,
      dividendsGbp,
      winRate,
    },
    positions,
    closedTrips,
    profitFactor,
    valueSeries,
    investedSeries,
    twr,
    benchTwr,
    allocation,
    tickerMeta,
    contribution,
    contributionStat,
    scatter,
    replayBenchmarkXirr: portfolioReplay.replayXirr,
  };
}

export function computeStock(ticker: string) {
  ensureDb();
  const inst = getInstrument(ticker);
  if (!inst) return null;
  const asOf = new Date().toISOString().slice(0, 10);
  const benchmark = loadBenchmark();
  const summary = analysePosition(inst, asOf, benchmark);
  if (!summary) return null;

  const orders = getOrdersByTicker(ticker).map(toOrder);
  const cashDivs = getAllDividends()
    .filter((d) => d.t212_ticker === ticker)
    .map(toDivCash);
  const market = loadMarket(inst.yahoo_symbol, inst.currency ?? "GBP");
  const holdings = computeHoldings({
    orders,
    splits: market.splits,
    prices: market.prices,
    fxRates: market.fxRates,
    currency: market.currency,
    asOfDate: asOf,
  });
  const episodes = buildEpisodes(orders, market.splits);
  const notes = Object.fromEntries(getAllNotes().map((n) => [n.order_id, n.text]));

  const avgCostSeries = holdings.daily.map((d) => ({
    date: d.date,
    value: d.avgFillLocal,
  }));

  const monthMap = new Map<string, number>();
  for (const o of orders) {
    const m = o.executedAt.slice(0, 7);
    const signed =
      o.side === "BUY"
        ? o.totalGbp + o.feesGbp
        : -(o.totalGbp - o.feesGbp);
    monthMap.set(m, (monthMap.get(m) ?? 0) + signed);
  }
  const monthlyFlow = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value }));

  const exits = [];
  for (const ep of episodes) {
    for (const exit of ep.exitEvents) {
      const post = computePostExit({
        exitEvent: exit,
        prices: market.prices,
        dividends: market.dividends,
        fxRates: market.fxRates,
        currency: market.currency,
        benchmarkPrices: benchmark.prices,
        benchmarkFxRates: benchmark.fxRates,
        benchmarkCurrency: benchmark.currency,
        tradingDates:
          market.tradingDates.length >= benchmark.tradingDates.length
            ? market.tradingDates
            : benchmark.tradingDates,
        asOfDate: asOf,
      });
      const ghost = computeGhost({
        exitEvent: exit,
        prices: market.prices,
        dividends: market.dividends,
        fxRates: market.fxRates,
        currency: market.currency,
        asOfDate: asOf,
      });
      exits.push({
        exit,
        post,
        ghost,
        notes: exit.orderIds.map((id) => notes[id]).filter(Boolean).join(" · "),
      });
    }
  }

  const trancheResult = computeTrancheReturns({
    orders,
    splits: market.splits,
    prices: market.prices,
    fxRates: market.fxRates,
    currency: market.currency,
    episodes,
    asOfDate: asOf,
  });

  const finalExit = exits.at(-1);
  let keptAnnotation: { gbp: number; pct: number } | null = null;
  if (finalExit && !summary.isOpen) {
    keptAnnotation = {
      gbp: finalExit.ghost.deltaGbp,
      pct: finalExit.ghost.deltaPct,
    };
  }

  return {
    asOf,
    instrument: {
      ticker: inst.t212_ticker,
      name: inst.name ?? inst.t212_ticker,
      currency: inst.currency ?? "GBP",
      yahooSymbol: inst.yahoo_symbol,
      yahooOverride: inst.yahoo_override,
      colorSlot: inst.color_slot,
      mappingFailed: !inst.yahoo_symbol,
    },
    summary,
    prices: market.prices,
    avgCostSeries,
    holdingsDaily: holdings.daily,
    orders,
    dividends: cashDivs,
    divEvents: market.dividends,
    monthlyFlow,
    exits,
    tranches: trancheResult,
    notes,
    keptAnnotation,
    episodes,
  };
}

export function computeDecisions() {
  ensureDb();
  const asOf = new Date().toISOString().slice(0, 10);
  const benchmark = loadBenchmark();
  const instruments = getTradedInstruments();
  const notes = Object.fromEntries(getAllNotes().map((n) => [n.order_id, n.text]));

  type ExitRow = {
    ticker: string;
    name: string;
    colorSlot: number | null;
    date: string;
    shares: number;
    proceedsGbp: number;
    raw6m: number | null;
    adj6m: number | null;
    ghostDeltaGbp: number;
    ghostDeltaPct: number;
    note: string;
  };

  const exitRows: ExitRow[] = [];
  let ghostAggregate = 0;
  const adj6m: number[] = [];
  const averaging = {
    downRet: 0,
    upRet: 0,
    downN: 0,
    upN: 0,
    downCap: 0,
    upCap: 0,
  };
  const buyDisciplineVals: number[] = [];

  for (const inst of instruments) {
    const orders = getOrdersByTicker(inst.t212_ticker).map(toOrder);
    if (!orders.length) continue;
    const market = loadMarket(inst.yahoo_symbol, inst.currency ?? "GBP");
    const episodes = buildEpisodes(orders, market.splits);

    const bd = computeBuyDiscipline(orders, market.splits, market.prices);
    if (bd.ratio != null) buyDisciplineVals.push(bd.ratio);

    const trancheResult = computeTrancheReturns({
      orders,
      splits: market.splits,
      prices: market.prices,
      fxRates: market.fxRates,
      currency: market.currency,
      episodes,
      asOfDate: asOf,
    });
    averaging.downN += trancheResult.down.count;
    averaging.upN += trancheResult.up.count;
    if (trancheResult.down.capitalGbp) {
      averaging.downRet +=
        trancheResult.down.totalReturn * trancheResult.down.capitalGbp;
      averaging.downCap += trancheResult.down.capitalGbp;
    }
    if (trancheResult.up.capitalGbp) {
      averaging.upRet +=
        trancheResult.up.totalReturn * trancheResult.up.capitalGbp;
      averaging.upCap += trancheResult.up.capitalGbp;
    }

    for (const ep of episodes) {
      for (const exit of ep.exitEvents) {
        const post = computePostExit({
          exitEvent: exit,
          prices: market.prices,
          dividends: market.dividends,
          fxRates: market.fxRates,
          currency: market.currency,
          benchmarkPrices: benchmark.prices,
          benchmarkFxRates: benchmark.fxRates,
          benchmarkCurrency: benchmark.currency,
          tradingDates:
            market.tradingDates.length >= benchmark.tradingDates.length
              ? market.tradingDates
              : benchmark.tradingDates,
          asOfDate: asOf,
        });
        const ghost = computeGhost({
          exitEvent: exit,
          prices: market.prices,
          dividends: market.dividends,
          fxRates: market.fxRates,
          currency: market.currency,
          asOfDate: asOf,
        });

        ghostAggregate += ghost.deltaGbp;
        const h6 = post.horizons.find((h) => h.horizonDays === 126);
        if (h6) adj6m.push(h6.adjustedReturn);

        exitRows.push({
          ticker: inst.t212_ticker,
          name: inst.name ?? inst.t212_ticker,
          colorSlot: inst.color_slot,
          date: exit.date,
          shares: exit.shares,
          proceedsGbp: exit.proceedsGbp,
          raw6m: h6?.rawReturn ?? null,
          adj6m: h6?.adjustedReturn ?? null,
          ghostDeltaGbp: ghost.deltaGbp,
          ghostDeltaPct: ghost.deltaPct,
          note: exit.orderIds.map((id) => notes[id]).filter(Boolean).join(" · "),
        });
      }
    }
  }

  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const portfolio = computePortfolio();

  return {
    asOf,
    kpis: {
      medianAdj6m: median(adj6m),
      averagingDown: {
        return: averaging.downCap
          ? averaging.downRet / averaging.downCap
          : null,
        n: averaging.downN,
      },
      averagingUp: {
        return: averaging.upCap ? averaging.upRet / averaging.upCap : null,
        n: averaging.upN,
      },
      medianBuyDiscipline: median(buyDisciplineVals),
      ghostAggregate,
    },
    exitRows,
    closedTrips: portfolio.closedTrips,
    winRate: portfolio.kpis.winRate,
    profitFactor: portfolio.profitFactor,
    strip: exitRows
      .filter((e) => e.adj6m != null)
      .map((e) => ({
        ticker: e.ticker,
        name: e.name,
        date: e.date,
        value: e.adj6m!,
        colorSlot: e.colorSlot,
      })),
  };
}
