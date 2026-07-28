import {
  getInstrument,
  getTradedInstruments,
  getAllOrders,
  getFxRate,
  getPrices,
  setInstrumentColorSlot,
} from '@/lib/db';

type FxLookup = (ccy: string, date: string) => number | null;

function peakMarketValueGbp(
  t212Ticker: string,
  yahooSymbol: string | null,
  currency: string | null,
  fxLookup: FxLookup,
): number {
  if (!yahooSymbol) return 0;

  const orders = getAllOrders().filter((o) => o.t212_ticker === t212Ticker);
  if (orders.length === 0) return 0;

  const prices = getPrices(yahooSymbol);
  if (prices.length === 0) return 0;

  let shares = 0;
  let peak = 0;
  const sortedOrders = [...orders].sort((a, b) => a.executed_at.localeCompare(b.executed_at));
  let orderIdx = 0;

  for (const price of prices) {
    while (
      orderIdx < sortedOrders.length &&
      sortedOrders[orderIdx]!.executed_at.slice(0, 10) <= price.date
    ) {
      const order = sortedOrders[orderIdx]!;
      if (order.side === 'BUY') shares += order.quantity;
      else shares -= order.quantity;
      orderIdx += 1;
    }

    const fx = currency === 'GBP' ? 1 : fxLookup(currency ?? 'GBP', price.date) ?? 1;
    const mv = shares * price.close_local * fx;
    if (mv > peak) peak = mv;
  }

  const latestPrice = prices[prices.length - 1];
  if (latestPrice) {
    const fx = currency === 'GBP' ? 1 : fxLookup(currency ?? 'GBP', latestPrice.date) ?? 1;
    const mv = shares * latestPrice.close_local * fx;
    if (mv > peak) peak = mv;
  }

  return peak;
}

export function assignColorSlots(fxLookup: FxLookup = (ccy, date) => getFxRate(ccy, date)): void {
  // Rank only traded instruments; the catalogue holds ~17k untraded entries.
  const instruments = getTradedInstruments();
  const ranked = instruments
    .map((inst) => ({
      ticker: inst.t212_ticker,
      peak: peakMarketValueGbp(inst.t212_ticker, inst.yahoo_symbol, inst.currency, fxLookup),
    }))
    .sort((a, b) => b.peak - a.peak);

  for (let i = 0; i < ranked.length; i += 1) {
    const slot = i < 8 ? i + 1 : null;
    setInstrumentColorSlot(ranked[i]!.ticker, slot);
  }
}

export function getColorSlot(t212Ticker: string): number | null {
  return getInstrument(t212Ticker)?.color_slot ?? null;
}

export const COLOR_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
