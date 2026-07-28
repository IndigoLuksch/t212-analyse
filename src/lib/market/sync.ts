import { BENCHMARK_YAHOO } from '@/lib/config';
import {
  getAllOrders,
  getFxRate,
  getInstrument,
  getLatestPriceDate,
  getSplits,
  getTradedInstruments,
  type OrderRow,
} from '@/lib/db';
import { getAccounts } from '@/lib/t212/accounts';
import { getPortfolio } from '@/lib/t212/client';
import { assignColorSlots } from './colors';
import { syncFxForCurrencies } from './fx';
import { mapAllInstruments } from './mapping';
import { syncYahooSymbol } from './yahoo';

export interface SyncProgress {
  phase: string;
  current: number;
  total?: number;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

export interface HoldingMismatch {
  t212_ticker: string;
  computed: number;
  reported: number;
  delta: number;
}

const SPLIT_ADJUST_QTY = (
  orders: OrderRow[],
  splits: Array<{ date: string; numerator: number; denominator: number }>,
): number => {
  let shares = 0;
  const sortedOrders = [...orders].sort((a, b) => a.executed_at.localeCompare(b.executed_at));

  for (const order of sortedOrders) {
    const orderDate = order.executed_at.slice(0, 10);
    let adjQty = order.quantity;
    for (const split of splits) {
      if (split.date > orderDate) {
        adjQty *= split.numerator / split.denominator;
      }
    }
    if (order.side === 'BUY') shares += adjQty;
    else shares -= adjQty;
  }
  return shares;
};

function computeHoldings(): Map<string, number> {
  const orders = getAllOrders();
  const holdings = new Map<string, number>();

  const byTicker = new Map<string, OrderRow[]>();
  for (const order of orders) {
    const list = byTicker.get(order.t212_ticker) ?? [];
    list.push(order);
    byTicker.set(order.t212_ticker, list);
  }

  for (const [ticker, tickerOrders] of byTicker) {
    const yahooSymbol = getInstrument(ticker)?.yahoo_symbol;
    let splits: Array<{ date: string; numerator: number; denominator: number }> = [];
    if (yahooSymbol) {
      splits = getSplits(yahooSymbol);
    }
    holdings.set(ticker, SPLIT_ADJUST_QTY(tickerOrders, splits));
  }

  return holdings;
}

export interface MarketSyncSummary {
  mapped: number;
  pricesSynced: number;
  fxRows: number;
  /** False when the T212 portfolio endpoint was unreachable, so `mismatches` is not meaningful. */
  reconciled: boolean;
  mismatches: HoldingMismatch[];
  staleSymbols: string[];
}

export async function runMarketSync(
  onProgress: SyncProgressCallback = () => undefined,
): Promise<MarketSyncSummary> {
  onProgress({ phase: 'mapping', current: 0 });
  const mappingResults = await mapAllInstruments((current, total) => {
    onProgress({ phase: 'mapping', current, total });
  });
  const mapped = [...mappingResults.values()].filter((r) => r.yahooSymbol !== null).length;

  // Scope price/FX work to instruments actually traded, not the full catalogue.
  const instruments = getTradedInstruments();
  const symbols = new Set<string>([BENCHMARK_YAHOO]);
  for (const inst of instruments) {
    if (inst.yahoo_symbol) symbols.add(inst.yahoo_symbol);
  }

  const staleSymbols: string[] = [];
  let pricesSynced = 0;
  const symbolList = [...symbols];
  for (let i = 0; i < symbolList.length; i += 1) {
    const symbol = symbolList[i]!;
    onProgress({ phase: 'prices', current: i, total: symbolList.length });
    const latest = getLatestPriceDate(symbol);
    const result = await syncYahooSymbol(symbol, latest ?? undefined);
    if (result.stale) staleSymbols.push(symbol);
    else pricesSynced += result.bars.length;
  }
  onProgress({ phase: 'prices', current: symbolList.length, total: symbolList.length });

  const currencies = new Set<string>(['GBP']);
  for (const inst of instruments) {
    if (inst.currency) currencies.add(inst.currency);
  }
  onProgress({ phase: 'fx', current: 0 });
  const fxRows = await syncFxForCurrencies([...currencies], undefined, (current, total) => {
    onProgress({ phase: 'fx', current, total });
  });

  onProgress({ phase: 'colors', current: 0 });
  assignColorSlots((ccy, date) => getFxRate(ccy, date));

  const computed = computeHoldings();
  const mismatches: HoldingMismatch[] = [];
  let reconciled = true;

  try {
    // Computed holdings pool every account, so the reported side has to as
    // well: the same ticker held in both the ISA and Invest is one position
    // here, and comparing against either leg alone reads as a mismatch.
    const reportedByTicker = new Map<string, number>();
    for (const account of getAccounts()) {
      const { data: portfolio } = await getPortfolio(account);
      for (const position of portfolio) {
        reportedByTicker.set(
          position.ticker,
          (reportedByTicker.get(position.ticker) ?? 0) + position.quantity,
        );
      }
    }

    for (const [ticker, reported] of reportedByTicker) {
      const calc = computed.get(ticker) ?? 0;
      const delta = Math.abs(calc - reported);
      if (delta > 1e-4) {
        mismatches.push({
          t212_ticker: ticker,
          computed: calc,
          reported,
          delta,
        });
      }
    }
  } catch {
    // The portfolio endpoint is rate-limited and often unavailable right after a
    // sync burst. Reconciliation simply didn't run — reporting every holding as
    // a mismatch would be a false alarm.
    reconciled = false;
  }

  onProgress({ phase: 'done', current: 1, total: 1 });

  return { mapped, pricesSynced, fxRows, reconciled, mismatches, staleSymbols };
}
