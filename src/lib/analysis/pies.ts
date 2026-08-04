import {
  getAllOrders,
  getInstrument,
  getFx,
  getPie,
  getPieInstruments,
  getPies,
  getPrices,
  getSplits,
  type OrderRow,
  type PieInstrumentRow,
  type PieRow,
} from "@/lib/db";
import { BENCHMARK_SP500_YAHOO, BENCHMARK_YAHOO } from "@/lib/config";
import { migrate } from "@/lib/db/migrate";
import {
  adjustOrder,
  annualiseReturn,
  closeOnDate,
  computeReplay,
  computeTwr,
  computeXirr,
  fxOnDate,
  sortOrdersByExecution,
  toUtcDate,
  uniqueSortedDates,
  yearsBetween,
  type FxRate,
  type Order,
  type PriceBar,
  type Split,
} from "@/lib/metrics";

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

interface ConstituentMarket {
  prices: PriceBar[];
  splits: Split[];
  fxRates: FxRate[];
  currency: string;
}

function loadConstituentMarket(
  yahooSymbol: string | null,
  currency: string,
): ConstituentMarket {
  const symbol = yahooSymbol ?? "";
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
  return { prices, splits, fxRates, currency: ccy };
}

interface AttributedFill {
  date: string;
  side: "BUY" | "SELL";
  /** Split-adjusted quantity attributed to the pie (0 when the fill was the legacy sleeve's). */
  pieQty: number;
  /** GBP moving in or out of the pie for this fill, fees included. */
  cashGbp: number;
}

interface Attribution {
  fills: AttributedFill[];
  /** Shares the pie holds today, for reconciliation against T212's own figure. */
  finalShares: number;
}

/**
 * Split a constituent's order history into the pie's shares and the "legacy
 * sleeve" — the standalone position that already existed when the pie was
 * created.
 *
 * T212 exposes no pie id on orders and no pie history, so attribution has to be
 * inferred. Three of this portfolio's constituents were held standalone before
 * the pie and liquidated months later, and their sells are indistinguishable
 * from pie sells by any field the API returns.
 *
 * The rule: the pie starts at zero shares on its creation date, every later BUY
 * adds to the pie, and every later SELL drains the legacy sleeve first and only
 * touches the pie once the sleeve is exhausted. Pre-creation orders are ignored
 * entirely — they built the sleeve, not the pie.
 *
 * This is not a heuristic that merely looks reasonable: it reproduces T212's
 * reported `ownedQuantity` exactly for every constituent, which the
 * reconciliation table on the pie page re-checks on every render.
 *
 * Known limit: while the sleeve still exists, a top-up buy of a sleeve holding
 * is credited to the pie, because nothing in the order distinguishes the two.
 * Share counts stay exact — the sleeve is sold off in the end either way — but
 * cost basis runs high by roughly those top-ups until the sleeve is gone. The
 * page shows the resulting delta against T212's own figure rather than hiding
 * it.
 */
export function attributeToPie(
  orders: Order[],
  splits: Split[],
  createdAt: string,
): Attribution {
  const chrono = sortOrdersByExecution(orders);

  let legacyShares = 0;
  for (const o of chrono) {
    if (toUtcDate(o.executedAt) >= createdAt) break;
    const { adjQty } = adjustOrder(o, splits);
    legacyShares += o.side === "BUY" ? adjQty : -adjQty;
  }
  legacyShares = Math.max(legacyShares, 0);

  const fills: AttributedFill[] = [];
  let pieShares = 0;

  for (const o of chrono) {
    const date = toUtcDate(o.executedAt);
    if (date < createdAt) continue;
    const { adjQty } = adjustOrder(o, splits);

    if (o.side === "BUY") {
      pieShares += adjQty;
      fills.push({
        date,
        side: "BUY",
        pieQty: adjQty,
        cashGbp: o.totalGbp + o.feesGbp,
      });
      continue;
    }

    const fromLegacy = Math.min(adjQty, legacyShares);
    legacyShares -= fromLegacy;
    const fromPie = adjQty - fromLegacy;
    pieShares -= fromPie;

    if (fromPie <= 0) continue;
    // Proceeds split in proportion to the share of the fill the pie supplied.
    const share = fromPie / adjQty;
    fills.push({
      date,
      side: "SELL",
      pieQty: fromPie,
      cashGbp: (o.totalGbp - o.feesGbp) * share,
    });
  }

  return { fills, finalShares: pieShares };
}

export interface PieConstituent {
  ticker: string;
  name: string;
  yahooSymbol: string | null;
  currency: string;
  colorSlot: number | null;
  targetShare: number;
  /** Weight computed from the reconstructed holding, not T212's snapshot. */
  actualShare: number;
  /** actualShare − targetShare, in percentage points. */
  driftPp: number;
  shares: number;
  valueGbp: number;
  /** Moving-average cost basis of the shares held now, as T212 reports it. */
  investedGbp: number;
  /** Buys minus sells in cash terms — diverges from basis once rebalancing starts. */
  netCashGbp: number;
  pnlGbp: number;
  totalReturn: number;
  /** Compound annual rate over the span held; null when too short to annualise. */
  annualisedReturn: number | null;
  xirr: number | null;
  firstBuy: string | null;
  /** Local-currency close rebased to 100 at the pie's creation date. */
  indexed: { date: string; index: number }[];
  /** Reconciliation against T212's reported holding. */
  reportedShares: number | null;
  sharesDelta: number | null;
}

export interface PieSeriesPoint {
  date: string;
  value: number;
}

export interface PieAnalysis {
  pie: {
    id: number;
    accountId: string;
    name: string;
    createdAt: string;
    endDate: string | null;
    goal: number | null;
    progress: number | null;
    cash: number | null;
    dividendCashAction: string | null;
    snapshotAt: string | null;
  };
  asOf: string;
  /** Reconstructed pie value, GBP, from creation to today. */
  valueSeries: PieSeriesPoint[];
  /** Cumulative net contributions into the pie, GBP. */
  investedSeries: PieSeriesPoint[];
  twr: { date: string; index: number }[];
  benchTwr: { date: string; index: number }[];
  sp500Twr: { date: string; index: number }[];
  /** Continuously rebalanced to the pie's target weights. */
  targetBlendTwr: { date: string; index: number }[];
  /** Continuously rebalanced to today's actual weights. */
  actualBlendTwr: { date: string; index: number }[];
  constituents: PieConstituent[];
  totals: {
    valueGbp: number;
    /** Cost basis of current holdings, comparable to T212's reported figure. */
    investedGbp: number;
    netCashGbp: number;
    pnlGbp: number;
    totalReturn: number;
    annualisedReturn: number | null;
    annualisedSuppressed: boolean;
    holdYears: number;
    xirr: number | null;
    twrAnnualised: number | null;
    /**
     * Annual rate the pie's own contributions would have earned in each
     * benchmark, and the pie's edge over it. Money-weighted on the same flows,
     * so a monthly autoinvest is not penalised for buying in late.
     */
    benchmarkXirr: number | null;
    benchmarkEdge: number | null;
    sp500Xirr: number | null;
    sp500Edge: number | null;
    /** Largest absolute drift across constituents, percentage points. */
    maxDriftPp: number;
    /** Sum of positive drifts — how far the pie is from its targets overall. */
    trackingErrorPp: number;
  };
  reported: {
    valueGbp: number | null;
    investedGbp: number | null;
    /** Reconstructed minus T212-reported value. */
    valueDelta: number | null;
    /** True when every constituent's share count matches T212 to within a dust threshold. */
    sharesReconcile: boolean;
  };
}

function indexSeries(
  prices: PriceBar[],
  fromDate: string,
): { date: string; index: number }[] {
  const out: { date: string; index: number }[] = [];
  const start = prices.find((p) => p.date >= fromDate)?.closeLocal;
  if (start === undefined || start === 0) return out;
  for (const p of prices) {
    if (p.date < fromDate) continue;
    out.push({ date: p.date, index: (p.closeLocal / start) * 100 });
  }
  return out;
}

/**
 * A continuously rebalanced blend of the constituents at fixed weights.
 *
 * Each day the index earns the weighted average of the constituents' daily
 * returns, which is what a pie *would* return if T212 rebalanced it perfectly
 * and costlessly. Charted against the pie's own TWR it isolates the cost of
 * drift and rebalancing from the allocation itself.
 *
 * Returns are taken in GBP so a constituent's FX move counts as part of its
 * return, matching how the pie's own value is measured.
 */
function blendedIndex(
  weights: Map<string, number>,
  seriesByTicker: Map<string, Map<string, number>>,
  dates: string[],
): { date: string; index: number }[] {
  const out: { date: string; index: number }[] = [];
  let index = 100;
  let prev: string | null = null;

  for (const date of dates) {
    if (prev !== null) {
      let weighted = 0;
      let covered = 0;
      for (const [ticker, weight] of weights) {
        const series = seriesByTicker.get(ticker);
        const now = series?.get(date);
        const before = series?.get(prev);
        if (now === undefined || before === undefined || before === 0) continue;
        weighted += weight * (now / before - 1);
        covered += weight;
      }
      // Renormalise over the constituents that actually have both quotes, so a
      // holiday on one exchange does not drag the blend toward zero.
      if (covered > 0) index *= 1 + weighted / covered;
    }
    out.push({ date, index });
    prev = date;
  }
  return out;
}

const SHARE_DUST = 1e-6;

export function computePie(pieId: number): PieAnalysis | null {
  migrate();
  const pieRow = getPie(pieId);
  if (!pieRow) return null;

  const createdAt = pieRow.created_at;
  if (!createdAt) return null;

  const asOf = new Date().toISOString().slice(0, 10);
  const rows = getPieInstruments(pieId);
  const allOrders = getAllOrders();

  // Pass 1 — attribute orders and collect every date any constituent trades on.
  // The calendar has to be complete before any value is computed: constituents
  // span UK and German exchanges, whose holidays differ, and a constituent that
  // never saw a date would contribute nothing to that day's total and punch a
  // hole in the series.
  interface Prepared {
    row: PieInstrumentRow;
    inst: ReturnType<typeof getInstrument>;
    market: ConstituentMarket;
    fills: AttributedFill[];
    finalShares: number;
  }

  const prepared: Prepared[] = [];
  const flowsByDate = new Map<string, { buys: number; sells: number }>();
  const dateSet = new Set<string>([createdAt, asOf]);

  for (const row of rows) {
    const inst = getInstrument(row.t212_ticker);
    const market = loadConstituentMarket(
      inst?.yahoo_symbol ?? null,
      inst?.currency ?? "GBP",
    );
    // The pie lives in one account; the same ETF traded in the other account is
    // a different position entirely and must not leak in.
    const orders = allOrders
      .filter(
        (o) =>
          o.t212_ticker === row.t212_ticker && o.account_id === pieRow.account_id,
      )
      .map(toOrder);

    const { fills, finalShares } = attributeToPie(orders, market.splits, createdAt);

    for (const f of fills) {
      dateSet.add(f.date);
      const bucket = flowsByDate.get(f.date) ?? { buys: 0, sells: 0 };
      if (f.side === "BUY") bucket.buys += f.cashGbp;
      else bucket.sells += f.cashGbp;
      flowsByDate.set(f.date, bucket);
    }
    for (const p of market.prices) {
      if (p.date >= createdAt && p.date <= asOf) dateSet.add(p.date);
    }

    prepared.push({ row, inst, market, fills, finalShares });
  }

  const dates = uniqueSortedDates([...dateSet]).filter(
    (d) => d >= createdAt && d <= asOf,
  );

  // Pass 2 — walk the shared calendar per constituent.
  const constituents: PieConstituent[] = [];
  const gbpValueByTickerDate = new Map<string, Map<string, number>>();
  const priceSeriesByTicker = new Map<string, Map<string, number>>();

  for (const { row, inst, market, fills, finalShares } of prepared) {
    const valueByDate = new Map<string, number>();
    const unitGbpByDate = new Map<string, number>();
    gbpValueByTickerDate.set(row.t212_ticker, valueByDate);
    priceSeriesByTicker.set(row.t212_ticker, unitGbpByDate);

    const fillsByDate = new Map<string, AttributedFill[]>();
    for (const f of fills) {
      const list = fillsByDate.get(f.date) ?? [];
      list.push(f);
      fillsByDate.set(f.date, list);
    }

    const constituentFlows = fills.map((f) => ({
      date: f.date,
      amountGbp: f.side === "BUY" ? -f.cashGbp : f.cashGbp,
    }));

    // Cost basis is carried on a moving average, matching T212's
    // `priceAvgInvestedValue` — the basis of what is *held*, not net cash in.
    // A rebalance that sells one constituent to buy another leaves net cash
    // unchanged but moves basis between them, so the two diverge and only the
    // basis makes `value / invested` a meaningful return.
    let running = 0;
    let costBasis = 0;
    let netCash = 0;

    for (const date of dates) {
      for (const f of fillsByDate.get(date) ?? []) {
        if (f.side === "BUY") {
          running += f.pieQty;
          costBasis += f.cashGbp;
          netCash += f.cashGbp;
        } else {
          const avgCost = running > 0 ? costBasis / running : 0;
          running -= f.pieQty;
          costBasis -= f.pieQty * avgCost;
          netCash -= f.cashGbp;
        }
      }
      if (Math.abs(running) < SHARE_DUST) {
        running = 0;
        costBasis = 0;
      }
      if (!market.prices.length) continue;
      try {
        // `closeOnDate` carries the last close forward, so a constituent whose
        // exchange is shut still holds its value on another exchange's session.
        const close = closeOnDate(market.prices, date);
        const fx = fxOnDate(market.fxRates, date, market.currency);
        unitGbpByDate.set(date, close * fx);
        valueByDate.set(date, running * close * fx);
      } catch {
        // Before this constituent's first quote — leave unset so the blend
        // skips the day rather than reading it as a zero.
      }
    }

    const valueGbp = valueByDate.get(asOf) ?? 0;
    if (valueGbp > 0) constituentFlows.push({ date: asOf, amountGbp: valueGbp });

    constituents.push({
      ticker: row.t212_ticker,
      name: inst?.name ?? row.t212_ticker,
      yahooSymbol: inst?.yahoo_symbol ?? null,
      currency: inst?.currency ?? market.currency,
      colorSlot: inst?.color_slot ?? null,
      targetShare: row.expected_share ?? 0,
      actualShare: 0,
      driftPp: 0,
      shares: finalShares,
      valueGbp,
      investedGbp: costBasis,
      netCashGbp: netCash,
      pnlGbp: valueGbp - costBasis,
      totalReturn: costBasis > 0 ? (valueGbp - costBasis) / costBasis : 0,
      annualisedReturn: annualiseReturn(
        costBasis > 0 ? (valueGbp - costBasis) / costBasis : 0,
        yearsBetween(fills.find((f) => f.side === "BUY")?.date ?? createdAt, asOf),
      ).annualised,
      xirr: computeXirr(constituentFlows).xirr,
      firstBuy: fills.find((f) => f.side === "BUY")?.date ?? null,
      indexed: indexSeries(market.prices, createdAt),
      reportedShares: row.owned_quantity,
      sharesDelta:
        row.owned_quantity != null ? finalShares - row.owned_quantity : null,
    });
  }

  // Pass 3 — pie-level aggregates over the same calendar.
  const valueSeries: PieSeriesPoint[] = [];
  const investedSeries: PieSeriesPoint[] = [];
  const twrDaily: {
    date: string;
    securitiesValue: number;
    buysGbp: number;
    sellsGbp: number;
    dividendsGbp: number;
  }[] = [];

  let cumulativeInvested = 0;
  for (const date of dates) {
    let total = 0;
    for (const byDate of gbpValueByTickerDate.values()) {
      total += byDate.get(date) ?? 0;
    }
    const flow = flowsByDate.get(date) ?? { buys: 0, sells: 0 };
    cumulativeInvested += flow.buys - flow.sells;

    valueSeries.push({ date, value: total });
    investedSeries.push({ date, value: cumulativeInvested });
    twrDaily.push({
      date,
      securitiesValue: total,
      buysGbp: flow.buys,
      sellsGbp: flow.sells,
      dividendsGbp: 0,
    });
  }

  const twr = computeTwr(twrDaily).map((p) => ({ date: p.date, index: p.index }));

  const targetWeights = new Map(
    constituents.filter((c) => c.targetShare > 0).map((c) => [c.ticker, c.targetShare]),
  );
  const totalValue = constituents.reduce((s, c) => s + c.valueGbp, 0);
  const actualWeights = new Map(
    constituents
      .filter((c) => c.valueGbp > 0)
      .map((c) => [c.ticker, c.valueGbp / (totalValue || 1)]),
  );

  const targetBlendTwr = blendedIndex(targetWeights, priceSeriesByTicker, dates);
  const actualBlendTwr = blendedIndex(actualWeights, priceSeriesByTicker, dates);

  for (const c of constituents) {
    c.actualShare = totalValue > 0 ? c.valueGbp / totalValue : 0;
    c.driftPp = (c.actualShare - c.targetShare) * 100;
  }
  constituents.sort((a, b) => b.targetShare - a.targetShare);

  const benchPrices = getPrices(BENCHMARK_YAHOO).map((p) => ({
    date: p.date,
    closeLocal: p.close_local,
  }));
  const sp500Prices = getPrices(BENCHMARK_SP500_YAHOO).map((p) => ({
    date: p.date,
    closeLocal: p.close_local,
  }));

  const investedTotal = constituents.reduce((s, c) => s + c.investedGbp, 0);
  const netCashTotal = constituents.reduce((s, c) => s + c.netCashGbp, 0);
  const pnlGbp = totalValue - investedTotal;

  const pieFlows: { date: string; amountGbp: number }[] = [];
  for (const [date, flow] of flowsByDate) {
    if (flow.buys > 0) pieFlows.push({ date, amountGbp: -flow.buys });
    if (flow.sells > 0) pieFlows.push({ date, amountGbp: flow.sells });
  }
  if (totalValue > 0) pieFlows.push({ date: asOf, amountGbp: totalValue });

  // Replay the pie's contributions into each benchmark on their actual dates.
  // Comparing the pie's money-weighted rate against a benchmark's time-weighted
  // one would flatter or punish it purely for when the money went in.
  const externalPieFlows = pieFlows.filter((f) => f.date !== asOf || f.amountGbp < 0);
  const replayOpts = { externalFlows: externalPieFlows, asOfDate: asOf };
  const benchReplay = benchPrices.length
    ? computeReplay(pieFlows, benchPrices, replayOpts)
    : null;
  const sp500Replay = sp500Prices.length
    ? computeReplay(pieFlows, sp500Prices, replayOpts)
    : null;

  const pieXirr = computeXirr(pieFlows).xirr;
  const drifts = constituents.map((c) => Math.abs(c.driftPp));
  const pieAnnualised = annualiseReturn(
    investedTotal > 0 ? pnlGbp / investedTotal : 0,
    yearsBetween(createdAt, asOf),
  );

  return {
    pie: {
      id: pieRow.id,
      accountId: pieRow.account_id,
      name: pieRow.name ?? `Pie ${pieRow.id}`,
      createdAt,
      endDate: pieRow.end_date,
      goal: pieRow.goal,
      progress: pieRow.progress,
      cash: pieRow.cash,
      dividendCashAction: pieRow.dividend_cash_action,
      snapshotAt: pieRow.snapshot_at,
    },
    asOf,
    valueSeries,
    investedSeries,
    twr,
    benchTwr: indexSeries(benchPrices, createdAt),
    sp500Twr: indexSeries(sp500Prices, createdAt),
    targetBlendTwr,
    actualBlendTwr,
    constituents,
    totals: {
      valueGbp: totalValue,
      investedGbp: investedTotal,
      netCashGbp: netCashTotal,
      pnlGbp,
      totalReturn: investedTotal > 0 ? pnlGbp / investedTotal : 0,
      annualisedReturn: pieAnnualised.annualised,
      annualisedSuppressed: pieAnnualised.suppressed,
      holdYears: pieAnnualised.holdYears,
      xirr: pieXirr,
      /** Annualised TWR: what the holdings earned, contribution timing removed. */
      twrAnnualised: annualiseReturn(
        (twr.at(-1)?.index ?? 100) / 100 - 1,
        pieAnnualised.holdYears,
      ).annualised,
      benchmarkXirr: benchReplay?.replayXirr ?? null,
      benchmarkEdge:
        pieXirr != null && benchReplay?.replayXirr != null
          ? pieXirr - benchReplay.replayXirr
          : null,
      sp500Xirr: sp500Replay?.replayXirr ?? null,
      sp500Edge:
        pieXirr != null && sp500Replay?.replayXirr != null
          ? pieXirr - sp500Replay.replayXirr
          : null,
      maxDriftPp: drifts.length ? Math.max(...drifts) : 0,
      trackingErrorPp: constituents.reduce(
        (s, c) => s + Math.max(c.driftPp, 0),
        0,
      ),
    },
    reported: {
      valueGbp: pieRow.value,
      investedGbp: pieRow.invested,
      valueDelta: pieRow.value != null ? totalValue - pieRow.value : null,
      sharesReconcile: constituents.every(
        (c) => c.sharesDelta == null || Math.abs(c.sharesDelta) < 1e-4,
      ),
    },
  };
}

export interface PieListEntry {
  id: number;
  accountId: string;
  name: string;
  createdAt: string | null;
  valueGbp: number | null;
  investedGbp: number | null;
  resultCoef: number | null;
  /** T212's cumulative return compounded down to an annual rate. */
  annualisedReturn: number | null;
  holdYears: number;
  constituentCount: number;
}

export function listPies(): PieListEntry[] {
  migrate();
  const asOf = new Date().toISOString().slice(0, 10);
  return getPies().map((p: PieRow) => {
    const holdYears = p.created_at ? yearsBetween(p.created_at, asOf) : 0;
    const annual = annualiseReturn(p.result_coef ?? 0, holdYears);
    return {
      id: p.id,
      accountId: p.account_id,
      name: p.name ?? `Pie ${p.id}`,
      createdAt: p.created_at,
      valueGbp: p.value,
      investedGbp: p.invested,
      resultCoef: p.result_coef,
      annualisedReturn: p.result_coef != null ? annual.annualised : null,
      holdYears,
      constituentCount: getPieInstruments(p.id).length,
    };
  });
}

export type { PieInstrumentRow };
