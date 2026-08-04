import {
  getAllDividends,
  getTradedInstruments,
  getAllNotes,
  getAllOrders,
  getAllTransactions,
  getDivEvents,
  getFirstBuyAfter,
  getFx,
  getInstrument,
  getOrder,
  getOrdersByTicker,
  getPrices,
  getSplits,
  getSyncState,
  listTheses,
  updateThesis,
  type DividendRow,
  type InstrumentRow,
  type OrderRow,
} from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { BENCHMARK_SP500_YAHOO, BENCHMARK_YAHOO } from "@/lib/config";
import {
  buildEpisodes,
  bucketValue,
  computeAllocation,
  computeBuyDiscipline,
  computeDecomposition,
  computeEntryContext,
  computeGhost,
  computeHoldings,
  computePositionReturn,
  computePostBuy,
  computePostExit,
  computeReplay,
  computeTrancheReturns,
  computeTwr,
  computeWorstPoint,
  computeXirr,
  ENTRY_CONTEXT_DIMENSIONS,
  POST_BUY_HORIZONS,
  adjustOrder,
  getRule,
  runSweep,
  annualiseReturn,
  sortOrdersByExecution,
  toUtcDate,
  yearsBetween,
  type CashFlow,
  type CounterfactualInput,
  type CounterfactualResult,
  type DivEvent,
  type DividendCash,
  type FxRate,
  type IdlePolicy,
  type Order,
  type PriceBar,
  type Split,
  type TickerMarket,
} from "@/lib/metrics";
import {
  daysUntilReview,
  isDueForReview,
  parseEntryContext,
} from "@/lib/theses";
import type {
  BuyingCurvePoint,
  BuyingResult,
  BuyRow,
  ContextBucketRow,
  StockBuyRow,
} from "./buyingTypes";

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

/** Per-request cache so computeDecisions / computeBuying share one load per ticker. */
type MarketCache = Map<string, MarketBundle>;

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

function cachedMarket(
  cache: MarketCache,
  ticker: string,
  yahoo: string | null,
  currency: string,
): MarketBundle {
  let bundle = cache.get(ticker);
  if (!bundle) {
    bundle = loadMarket(yahoo, currency);
    cache.set(ticker, bundle);
  }
  return bundle;
}

/**
 * An instrument with no price bars — unmapped symbol, delisted, or bought
 * before the latest sync reached it. Every price-derived metric throws on it
 * (`closeOnDate` has nothing to look up), so callers skip it rather than
 * 500-ing the whole page over one position.
 */
function hasNoPrices(market: MarketBundle): boolean {
  return market.prices.length === 0;
}

function tradingDatesFor(
  market: MarketBundle,
  benchmark: { tradingDates: string[] },
): string[] {
  return market.tradingDates.length >= benchmark.tradingDates.length
    ? market.tradingDates
    : benchmark.tradingDates;
}

const HORIZON_LABELS: Record<number, string> = {
  30: "30d",
  90: "3m",
  182: "6m",
  365: "1y",
  730: "2y",
};

function medianOf(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (1 - (idx - lo)) + sorted[hi]! * (idx - lo);
}

function shiftIsoDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
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

interface Benchmark {
  prices: PriceBar[];
  fxRates: FxRate[];
  currency: string;
  tradingDates: string[];
}

/** Both benchmark symbols are GBP accumulating ETFs, so neither needs an FX leg. */
function loadBenchmarkSymbol(symbol: string): Benchmark {
  const prices = getPrices(symbol).map((p) => ({
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

function loadBenchmark(): Benchmark {
  return loadBenchmarkSymbol(BENCHMARK_YAHOO);
}

function loadSp500Benchmark(): Benchmark {
  return loadBenchmarkSymbol(BENCHMARK_SP500_YAHOO);
}

/**
 * Rebase a price series to 100 at `firstDate`, matching how the portfolio's own
 * TWR line is indexed so the two are read off the same axis.
 */
function indexedTwr(
  benchmark: Benchmark,
  firstDate: string | undefined,
): { date: string; index: number }[] {
  const series: { date: string; index: number }[] = [];
  if (!firstDate || !benchmark.prices.length) return series;

  const startPx =
    benchmark.prices.find((p) => p.date >= firstDate)?.closeLocal ??
    benchmark.prices[0]!.closeLocal;
  for (const p of benchmark.prices) {
    if (p.date < firstDate) continue;
    series.push({ date: p.date, index: (p.closeLocal / startPx) * 100 });
  }
  return series;
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

/** Index-adjusted post-buy returns for a single order (pipeline linked buys). */
export function computeBuyAdjForOrder(
  orderId: string,
): { adj90: number | null; adj182: number | null; adj365: number | null } | null {
  ensureDb();
  const row = getOrder(orderId);
  if (!row || row.side !== "BUY") return null;

  const inst = getInstrument(row.t212_ticker);
  if (!inst) return null;

  const yahoo = inst.yahoo_override ?? inst.yahoo_symbol;
  const market = loadMarket(yahoo, inst.currency ?? "GBP");
  if (hasNoPrices(market)) return null;
  const benchmark = loadBenchmark();
  const order = toOrder(row);
  const date = toUtcDate(order.executedAt);
  const { adjQty } = adjustOrder(order, market.splits);
  const capitalGbp = order.totalGbp + order.feesGbp;
  const dates = tradingDatesFor(market, benchmark);
  const asOf = new Date().toISOString().slice(0, 10);

  const post = computePostBuy({
    buyDate: date,
    capitalGbp,
    shares: adjQty,
    prices: market.prices,
    dividends: market.dividends,
    fxRates: market.fxRates,
    currency: market.currency,
    benchmarkPrices: benchmark.prices,
    benchmarkFxRates: benchmark.fxRates,
    benchmarkCurrency: benchmark.currency,
    tradingDates: dates,
    asOfDate: asOf,
  });

  const adjAt = (h: number) => post.points.find((p) => p.horizonDays === h)?.adj ?? null;
  return { adj90: adjAt(90), adj182: adjAt(182), adj365: adjAt(365) };
}

export function listPipelineTheses() {
  ensureDb();
  const today = new Date().toISOString().slice(0, 10);

  return listTheses().map((row) => {
    let linkedOrderId = row.linked_order_id;
    if (!linkedOrderId && row.t212_ticker) {
      const order = getFirstBuyAfter(row.t212_ticker, row.created_at);
      if (order) {
        linkedOrderId = order.id;
        updateThesis(row.id, { linked_order_id: linkedOrderId });
      }
    }
    return {
      ...row,
      linked_order_id: linkedOrderId,
      entry_context: parseEntryContext(row.entry_context),
      due: isDueForReview(row.review_at, today),
      days_until_review: daysUntilReview(row.review_at, today),
      linked_adj: linkedOrderId ? computeBuyAdjForOrder(linkedOrderId) : null,
    };
  });
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

export type ClosedTrip = {
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
};

function computeClosedTrips(
  instruments: InstrumentRow[],
  allDivs: DividendCash[],
  asOf: string,
): ClosedTrip[] {
  const closedTrips: ClosedTrip[] = [];

  for (const inst of instruments) {
    const orders = getOrdersByTicker(inst.t212_ticker).map(toOrder);
    if (!orders.length) continue;
    const market = loadMarket(inst.yahoo_symbol, inst.currency ?? "GBP");
    if (hasNoPrices(market)) continue;
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

  return closedTrips;
}

function closedTripStats(closedTrips: ClosedTrip[]) {
  const wins = closedTrips.filter((t) => t.pnl > 0);
  const losses = closedTrips.filter((t) => t.pnl < 0);
  const winRate = closedTrips.length ? wins.length / closedTrips.length : null;
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;
  return { winRate, profitFactor };
}

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

/**
 * Annual rate implied by a TWR index that started at 100. Short spans return
 * null on the same basis as every other annualised figure.
 */
function annualisedFromIndex(
  endIndex: number | undefined,
  holdYears: number,
): number | null {
  if (endIndex === undefined || endIndex <= 0) return null;
  return annualiseReturn(endIndex / 100 - 1, holdYears).annualised;
}

export function computePortfolio() {
  ensureDb();
  const asOf = new Date().toISOString().slice(0, 10);
  const instruments = getTradedInstruments();
  const benchmark = loadBenchmark();
  const sp500 = loadSp500Benchmark();

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
  const emptyReplay = {
    pickingEdge: null as number | null,
    replayXirr: null,
    suppressAnnualised: true,
    replayTotalReturn: 0,
  };
  const replayOptions = {
    externalFlows: portfolioExternalFlows,
    asOfDate: asOf,
  };
  const portfolioReplay = benchmark.prices.length
    ? computeReplay(portfolioFlows, benchmark.prices, replayOptions)
    : emptyReplay;
  // Same cashflows replayed into the S&P instead, so the scatter's two
  // reference lines are computed identically and differ only in the index.
  const sp500Replay = sp500.prices.length
    ? computeReplay(portfolioFlows, sp500.prices, replayOptions)
    : emptyReplay;

  const invested = positions.reduce((s, p) => s + p.invested, 0);
  const returned = positions.reduce((s, p) => s + p.returned, 0);
  const pnlGbp = returned + openValue - invested;
  const totalReturn = invested > 0 ? pnlGbp / invested : 0;
  const dividendsGbp = allDivs.reduce((s, d) => s + d.amountGbp, 0);

  const closedTrips = computeClosedTrips(instruments, allDivs, asOf);
  const { winRate, profitFactor } = closedTripStats(closedTrips);

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
    if (hasNoPrices(market)) continue;
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

  // One forward cursor per ticker; both `dates` and each daily series are
  // ascending, so advancing as date advances is O(dates + bars) not O(dates × bars).
  const tickerCursors = [...dailyByTicker.entries()].map(([ticker, daily]) => ({
    ticker,
    daily,
    idx: -1,
  }));

  for (const date of dates) {
    let total = 0;
    for (const cur of tickerCursors) {
      const { daily } = cur;
      while (cur.idx + 1 < daily.length && daily[cur.idx + 1].date <= date) {
        cur.idx++;
      }
      const last = cur.idx >= 0 ? daily[cur.idx] : undefined;
      const mv = last && last.shares > 0 ? last.marketValueGbp : 0;
      if (mv > 0) {
        allocationFlat.push({ date, ticker: cur.ticker, marketValueGbp: mv });
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
  const benchTwr = indexedTwr(benchmark, firstDate);
  const sp500Twr = indexedTwr(sp500, firstDate);

  const allocation = computeAllocation(allocationFlat);

  /**
   * Trailing 3-month price return per holding per day, for the allocation
   * chart's heat colouring. Same 63-bar window `computeEntryContext` uses, so a
   * "rallying" band here means the same thing as a rallying entry there.
   *
   * Local-currency close: the question this answers is whether the stock ran up
   * before a position was trimmed, and folding FX in would muddy that with a
   * move the holding itself never made.
   */
  const allocationHeat: { date: string; heat: Record<string, number> }[] = [];
  const heatCursors = instruments
    .map((inst) => {
      const market = loadMarket(inst.yahoo_symbol, inst.currency ?? "GBP");
      return { ticker: inst.t212_ticker, prices: market.prices, idx: -1 };
    })
    .filter((c) => c.prices.length > 0);

  const TRAILING_BARS = 63;
  for (const date of dates) {
    const heat: Record<string, number> = {};
    for (const cur of heatCursors) {
      while (cur.idx + 1 < cur.prices.length && cur.prices[cur.idx + 1]!.date <= date) {
        cur.idx++;
      }
      if (cur.idx < TRAILING_BARS) continue;
      const now = cur.prices[cur.idx]!.closeLocal;
      const then = cur.prices[cur.idx - TRAILING_BARS]!.closeLocal;
      if (then > 0) heat[cur.ticker] = (now - then) / then;
    }
    allocationHeat.push({ date, heat });
  }

  /**
   * Stacking and colour order for the allocation chart: current holdings first,
   * largest to smallest, then everything since closed by the largest weight it
   * ever reached.
   *
   * Computed here over the *whole* history rather than in the chart, because the
   * chart's copy is clipped to the selected time range — deriving the order
   * there would repaint and reorder every band whenever the range changed.
   */
  const lastWeights = allocation.at(-1)?.weights ?? {};
  const peakWeight = new Map<string, number>();
  for (const day of allocation) {
    for (const [ticker, w] of Object.entries(day.weights)) {
      if (w > (peakWeight.get(ticker) ?? 0)) peakWeight.set(ticker, w);
    }
  }
  const allocationOrder = [...peakWeight.keys()].sort((a, b) => {
    const nowA = lastWeights[a] ?? 0;
    const nowB = lastWeights[b] ?? 0;
    if (nowA !== nowB) return nowB - nowA;
    return (peakWeight.get(b) ?? 0) - (peakWeight.get(a) ?? 0);
  });


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

  // Span the portfolio has been running: first trade to today.
  const heroAnnualised = annualiseReturn(
    totalReturn,
    firstDate ? yearsBetween(firstDate, asOf) : 0,
  );

  return {
    asOf,
    hero: {
      pnlGbp,
      totalReturn,
      /**
       * Annualised time-weighted return: what the holdings earned per year with
       * contribution timing divided out, so it answers "were these the right
       * things to own, in these proportions" and is directly comparable to the
       * benchmark lines on the performance chart.
       */
      twrAnnualised: annualisedFromIndex(twr.at(-1)?.index, heroAnnualised.holdYears),
      benchTwrAnnualised: annualisedFromIndex(
        benchTwr.at(-1)?.index,
        heroAnnualised.holdYears,
      ),
      // Fallback rate for when the span is too short for XIRR to be reported.
      annualisedReturn: heroAnnualised.annualised,
      annualisedSuppressed: heroAnnualised.suppressed,
      holdYears: heroAnnualised.holdYears,
      xirr: portfolioXirr.xirr,
      suppressAnnualised: portfolioXirr.suppressAnnualised,
      pickingEdge: portfolioReplay.pickingEdge,
      replayXirr: portfolioReplay.replayXirr,
    },
    kpis: {
      currentValue: openValue,
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
    sp500Twr,
    allocation,
    allocationHeat,
    allocationOrder,
    tickerMeta,
    contribution,
    contributionStat,
    scatter,
    replayBenchmarkXirr: portfolioReplay.replayXirr,
    replaySp500Xirr: sp500Replay.replayXirr,
  };
}

/** Signed GBP in/out per calendar month, oldest first. */
function monthlyFlowOf(orders: Order[]): { month: string; value: number }[] {
  const monthMap = new Map<string, number>();
  for (const o of orders) {
    const m = o.executedAt.slice(0, 7);
    const signed =
      o.side === "BUY" ? o.totalGbp + o.feesGbp : -(o.totalGbp - o.feesGbp);
    monthMap.set(m, (monthMap.get(m) ?? 0) + signed);
  }
  return [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value }));
}

function emptyTrancheResult(): ReturnType<typeof computeTrancheReturns> {
  const zero = { count: 0, capitalGbp: 0, totalReturn: 0 };
  return { up: { ...zero }, down: { ...zero }, tranches: [] };
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
  const instrument = {
    ticker: inst.t212_ticker,
    name: inst.name ?? inst.t212_ticker,
    currency: inst.currency ?? "GBP",
    yahooSymbol: inst.yahoo_symbol,
    yahooOverride: inst.yahoo_override,
    colorSlot: inst.color_slot,
    mappingFailed: !inst.yahoo_symbol,
  };

  // Without prices there is nothing to chart and no return to decompose, but
  // the page must still render — it hosts the Yahoo-override form that is the
  // user's way to fix an unmapped symbol. `summary` is already cash-only here.
  if (hasNoPrices(market)) {
    return {
      asOf,
      instrument,
      summary,
      prices: [],
      avgCostSeries: [],
      holdingsDaily: [],
      orders,
      dividends: cashDivs,
      divEvents: [],
      monthlyFlow: monthlyFlowOf(orders),
      exits: [],
      tranches: emptyTrancheResult(),
      notes: Object.fromEntries(getAllNotes().map((n) => [n.order_id, n.text])),
      keptAnnotation: null,
      heldRange: { start: asOf, end: asOf },
      episodes: buildEpisodes(orders, market.splits),
      buys: [] as StockBuyRow[],
    };
  }

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

  // NaN on flat days, not 0: LineSeries skips non-finite points, so the line
  // breaks between episodes instead of diving to the x-axis.
  const avgCostSeries = holdings.daily.map((d) => ({
    date: d.date,
    value: d.shares > 0 ? d.avgFillLocal : Number.NaN,
  }));

  const monthlyFlow = monthlyFlowOf(orders);

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

  const trancheClass = new Map(
    trancheResult.tranches.map((t) => [t.trancheId, t.classification] as const),
  );
  const dates = tradingDatesFor(market, benchmark);
  const buys: StockBuyRow[] = [];
  for (const o of sortOrdersByExecution(orders)) {
    if (o.side !== "BUY") continue;
    const date = toUtcDate(o.executedAt);
    const { adjQty } = adjustOrder(o, market.splits);
    const capitalGbp = o.totalGbp + o.feesGbp;
    const post = computePostBuy({
      buyDate: date,
      capitalGbp,
      shares: adjQty,
      prices: market.prices,
      dividends: market.dividends,
      fxRates: market.fxRates,
      currency: market.currency,
      benchmarkPrices: benchmark.prices,
      benchmarkFxRates: benchmark.fxRates,
      benchmarkCurrency: benchmark.currency,
      tradingDates: dates,
      asOfDate: asOf,
    });
    const adjAt = (h: number) =>
      post.points.find((p) => p.horizonDays === h)?.adj ?? null;
    buys.push({
      date,
      capitalGbp,
      classification: trancheClass.get(o.id) ?? "base",
      entryContext: computeEntryContext(date, market.prices),
      adj90: adjAt(90),
      adj182: adjAt(182),
      adj365: adjAt(365),
      orderId: o.id,
    });
  }

  const finalExit = exits.at(-1);
  let keptAnnotation: { gbp: number; pct: number } | null = null;
  if (finalExit && !summary.isOpen) {
    keptAnnotation = {
      gbp: finalExit.ghost.deltaGbp,
      pct: finalExit.ghost.deltaPct,
    };
  }

  // The window the position was actually held, padded either side. For a closed
  // position the point of the post-exit line is what happened *after*, so the
  // exit never sits on the right edge.
  const firstFill = orders[0]?.executedAt.slice(0, 10) ?? asOf;
  const lastHeldDate = summary.isOpen ? asOf : (finalExit?.exit.date ?? asOf);
  const spanDays = Math.max(
    (Date.parse(`${lastHeldDate}T00:00:00Z`) -
      Date.parse(`${firstFill}T00:00:00Z`)) /
      86_400_000,
    0,
  );
  const pad = Math.min(Math.max(Math.round(spanDays * 0.15), 30), 365);
  const paddedStart = shiftIsoDays(firstFill, -pad);
  const paddedEnd = shiftIsoDays(lastHeldDate, pad);
  const firstPriceDate = market.prices[0]?.date;
  const lastPriceDate = market.prices.at(-1)?.date;
  const heldRange = {
    start:
      firstPriceDate && firstPriceDate > paddedStart ? firstPriceDate : paddedStart,
    end: lastPriceDate && lastPriceDate < paddedEnd ? lastPriceDate : paddedEnd,
  };

  return {
    asOf,
    instrument,
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
    heldRange,
    episodes,
    buys,
  };
}

export function computeDecisions() {
  ensureDb();
  const asOf = new Date().toISOString().slice(0, 10);
  const benchmark = loadBenchmark();
  const instruments = getTradedInstruments();
  const notes = Object.fromEntries(getAllNotes().map((n) => [n.order_id, n.text]));
  const marketCache: MarketCache = new Map();

  type ExitRow = {
    ticker: string;
    name: string;
    colorSlot: number | null;
    date: string;
    shares: number;
    proceedsGbp: number;
    rawAnn: number | null;
    adjAnn: number | null;
    ghostDeltaGbp: number;
    ghostDeltaPct: number;
    note: string;
    /** Identifies the row — a stock can have two exits on the same date. */
    orderIds: string[];
  };

  const exitRows: ExitRow[] = [];
  let ghostAggregate = 0;
  const adjAnn: number[] = [];

  for (const inst of instruments) {
    const orders = getOrdersByTicker(inst.t212_ticker).map(toOrder);
    if (!orders.length) continue;
    const market = cachedMarket(
      marketCache,
      inst.t212_ticker,
      inst.yahoo_symbol,
      inst.currency ?? "GBP",
    );
    if (hasNoPrices(market)) continue;
    const episodes = buildEpisodes(orders, market.splits);
    const dates = tradingDatesFor(market, benchmark);

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
          tradingDates: dates,
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
        if (post.adjAnnualised != null) adjAnn.push(post.adjAnnualised);

        exitRows.push({
          ticker: inst.t212_ticker,
          name: inst.name ?? inst.t212_ticker,
          colorSlot: inst.color_slot,
          date: exit.date,
          shares: exit.shares,
          proceedsGbp: exit.proceedsGbp,
          rawAnn: post.rawAnnualised,
          adjAnn: post.adjAnnualised,
          ghostDeltaGbp: ghost.deltaGbp,
          ghostDeltaPct: ghost.deltaPct,
          note: exit.orderIds.map((id) => notes[id]).filter(Boolean).join(" · "),
          orderIds: exit.orderIds,
        });
      }
    }
  }

  const allDivs = getAllDividends().map(toDivCash);
  const closedTrips = computeClosedTrips(instruments, allDivs, asOf);
  const { winRate, profitFactor } = closedTripStats(closedTrips);

  return {
    asOf,
    kpis: {
      medianAdjAnn: medianOf(adjAnn),
      ghostAggregate,
    },
    exitRows,
    closedTrips,
    winRate,
    profitFactor,
    strip: exitRows
      .filter((e) => e.adjAnn != null)
      .map((e) => ({
        id: e.orderIds.join("-"),
        ticker: e.ticker,
        name: e.name,
        date: e.date,
        value: e.adjAnn!,
        colorSlot: e.colorSlot,
      })),
  };
}

/**
 * Portfolio-wide buy-quality aggregation: post-buy curve, entry-context buckets,
 * timing strip, and buy-side KPIs.
 */
export function computeBuying(): BuyingResult {
  ensureDb();
  const asOf = new Date().toISOString().slice(0, 10);
  const benchmark = loadBenchmark();
  const instruments = getTradedInstruments();
  const notes = Object.fromEntries(getAllNotes().map((n) => [n.order_id, n.text]));
  const marketCache: MarketCache = new Map();

  const buyRows: BuyRow[] = [];
  const averaging = {
    downRet: 0,
    upRet: 0,
    downN: 0,
    upN: 0,
    downCap: 0,
    upCap: 0,
  };
  const buyDisciplineVals: number[] = [];

  // Per-horizon accumulators for the curve.
  const curveAcc = new Map<
    number,
    { adjSum: number; cap: number; vals: number[] }
  >();
  for (const h of POST_BUY_HORIZONS) {
    curveAcc.set(h, { adjSum: 0, cap: 0, vals: [] });
  }

  // Context bucket accumulators: dim|bucketId → {adjSum, cap, n}
  const bucketAcc = new Map<string, { adjSum: number; cap: number; n: number }>();

  for (const inst of instruments) {
    const orders = getOrdersByTicker(inst.t212_ticker).map(toOrder);
    if (!orders.length) continue;
    const market = cachedMarket(
      marketCache,
      inst.t212_ticker,
      inst.yahoo_symbol,
      inst.currency ?? "GBP",
    );
    if (hasNoPrices(market)) continue;
    const episodes = buildEpisodes(orders, market.splits);
    const dates = tradingDatesFor(market, benchmark);

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

    const trancheClass = new Map(
      trancheResult.tranches.map((t) => [t.trancheId, t.classification] as const),
    );

    for (const o of sortOrdersByExecution(orders)) {
      if (o.side !== "BUY") continue;
      const date = toUtcDate(o.executedAt);
      const { adjQty } = adjustOrder(o, market.splits);
      const capitalGbp = o.totalGbp + o.feesGbp;
      const post = computePostBuy({
        buyDate: date,
        capitalGbp,
        shares: adjQty,
        prices: market.prices,
        dividends: market.dividends,
        fxRates: market.fxRates,
        currency: market.currency,
        benchmarkPrices: benchmark.prices,
        benchmarkFxRates: benchmark.fxRates,
        benchmarkCurrency: benchmark.currency,
        tradingDates: dates,
        asOfDate: asOf,
      });

      const adjByHorizon: Record<number, number | null> = {};
      for (const pt of post.points) {
        adjByHorizon[pt.horizonDays] = pt.adj;
        if (pt.matured && pt.adj != null) {
          const acc = curveAcc.get(pt.horizonDays)!;
          acc.adjSum += pt.adj * capitalGbp;
          acc.cap += capitalGbp;
          acc.vals.push(pt.adj);
        }
      }

      const entryContext = computeEntryContext(date, market.prices);
      const adj365 = adjByHorizon[365] ?? null;

      if (adj365 != null) {
        for (const dim of ENTRY_CONTEXT_DIMENSIONS) {
          const bucket = bucketValue(entryContext[dim.key], dim.buckets);
          if (!bucket) continue;
          const key = `${dim.key}|${bucket.id}`;
          const acc = bucketAcc.get(key) ?? { adjSum: 0, cap: 0, n: 0 };
          acc.adjSum += adj365 * capitalGbp;
          acc.cap += capitalGbp;
          acc.n += 1;
          bucketAcc.set(key, acc);
        }
      }

      buyRows.push({
        ticker: inst.t212_ticker,
        name: inst.name ?? inst.t212_ticker,
        colorSlot: inst.color_slot,
        date,
        capitalGbp,
        classification: trancheClass.get(o.id) ?? "base",
        entryContext,
        adjByHorizon,
        adj365,
        note: notes[o.id] ?? "",
        orderId: o.id,
      });
    }
  }

  const curve: BuyingCurvePoint[] = POST_BUY_HORIZONS.map((h) => {
    const acc = curveAcc.get(h)!;
    const sorted = [...acc.vals].sort((a, b) => a - b);
    return {
      horizonDays: h,
      label: HORIZON_LABELS[h] ?? `${h}d`,
      adj: acc.cap > 0 ? acc.adjSum / acc.cap : null,
      median: medianOf(sorted),
      iqrLo: percentile(sorted, 0.25),
      iqrHi: percentile(sorted, 0.75),
      n: acc.vals.length,
      capitalGbp: acc.cap,
    };
  });

  const contextBuckets: ContextBucketRow[] = [];
  for (const dim of ENTRY_CONTEXT_DIMENSIONS) {
    for (const bucket of dim.buckets) {
      const acc = bucketAcc.get(`${dim.key}|${bucket.id}`);
      contextBuckets.push({
        dimension: dim.key,
        dimensionLabel: dim.label,
        bucketId: bucket.id,
        bucketLabel: bucket.label,
        adj365: acc && acc.cap > 0 ? acc.adjSum / acc.cap : null,
        n: acc?.n ?? 0,
        capitalGbp: acc?.cap ?? 0,
      });
    }
  }

  const matured365 = buyRows.filter((r) => r.adj365 != null);
  const adj365Headline =
    matured365.length > 0
      ? matured365.reduce((s, r) => s + r.adj365! * r.capitalGbp, 0) /
        matured365.reduce((s, r) => s + r.capitalGbp, 0)
      : null;

  return {
    asOf,
    kpis: {
      medianBuyDiscipline: medianOf(buyDisciplineVals),
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
      adj365: adj365Headline,
    },
    curve,
    buyRows,
    contextBuckets,
    strip: buyRows
      .filter((r) => r.adj365 != null)
      .map((r) => ({
        id: r.orderId,
        ticker: r.ticker,
        name: r.name,
        date: r.date,
        value: r.adj365!,
        colorSlot: r.colorSlot,
      })),
  };
}

/**
 * Build the counterfactual input from the live DB for the replay lab.
 */
export function buildCounterfactualInput(
  policy: IdlePolicy = "benchmark",
): CounterfactualInput {
  ensureDb();
  const asOf = new Date().toISOString().slice(0, 10);
  const benchmark = loadBenchmark();
  const instruments = getTradedInstruments();
  const marketCache: MarketCache = new Map();
  const markets = new Map<string, TickerMarket>();
  const names = new Map<string, string>();
  const allOrders: Order[] = [];
  const fees: number[] = [];

  for (const inst of instruments) {
    const orders = getOrdersByTicker(inst.t212_ticker).map(toOrder);
    if (!orders.length) continue;
    const market = cachedMarket(
      marketCache,
      inst.t212_ticker,
      inst.yahoo_symbol,
      inst.currency ?? "GBP",
    );
    // Skip before contributing orders: a ticker in `allOrders` with no entry in
    // `markets` would fault the replay when it looks the market up.
    if (hasNoPrices(market)) continue;
    names.set(inst.t212_ticker, inst.name ?? inst.t212_ticker);
    allOrders.push(...orders);
    for (const o of orders) {
      if (o.feesGbp > 0) fees.push(o.feesGbp);
    }
    markets.set(inst.t212_ticker, {
      prices: market.prices,
      splits: market.splits,
      fxRates: market.fxRates,
      currency: market.currency,
      tradingDates: tradingDatesFor(market, benchmark),
      dividends: market.dividends,
    });
  }

  const sortedFees = [...fees].sort((a, b) => a - b);
  const medianFeeGbp = sortedFees.length
    ? sortedFees[Math.floor(sortedFees.length / 2)]!
    : 0;

  let cashRate = 0;
  const txs = getAllTransactions().filter((t) => t.type === "INTEREST_ON_FREE_CASH");
  const deposits = getAllTransactions().filter((t) => t.type === "DEPOSIT");
  const interestSum = txs.reduce((s, t) => s + (t.amount_gbp ?? 0), 0);
  const depositSum = deposits.reduce((s, t) => s + Math.abs(t.amount_gbp ?? 0), 0);
  if (interestSum > 0 && depositSum > 0) {
    cashRate = Math.min(0.1, interestSum / depositSum);
  }

  return {
    orders: allOrders,
    names,
    markets,
    benchmarkPrices: benchmark.prices,
    cashRate,
    medianFeeGbp,
    asOfDate: asOf,
    policy,
  };
}

export function runReplaySweep(args: {
  ruleId: string;
  params: Record<string, number>;
  policy: IdlePolicy;
}): { params: Record<string, number>; result: CounterfactualResult }[] {
  const rule = getRule(args.ruleId);
  if (!rule) throw new Error(`Unknown rule: ${args.ruleId}`);

  const input = buildCounterfactualInput(args.policy);

  const grid: Record<string, number[]> = {};
  const primary = rule.params[0];
  if (primary) {
    grid[primary.key] = primary.values.slice(0, 12);
  }
  for (let i = 1; i < rule.params.length; i++) {
    const p = rule.params[i]!;
    const v = args.params[p.key] ?? p.values[Math.floor(p.values.length / 2)]!;
    grid[p.key] = [v];
  }

  if (Object.keys(grid).length === 0) {
    return [{ params: {}, result: runSweep(input, args.ruleId, {})[0]!.result }];
  }

  return runSweep(input, args.ruleId, grid);
}

export type {
  BuyRow,
  StockBuyRow,
  BuyingResult,
  BuyingCurvePoint,
  ContextBucketRow,
  BuyingKpis,
  BuyingStripPoint,
} from "./buyingTypes";
