import type { T212OrderItem } from './client';
import { isPence, toMajorUnits } from '@/lib/metrics/pence';

export type FxLookup = (ccy: string, date: string) => number | null;

export interface NormalizedOrder {
  id: string;
  t212_ticker: string;
  side: 'BUY' | 'SELL';
  executed_at: string;
  quantity: number;
  fill_price_local: number;
  total_gbp: number;
  fees_gbp: number;
  gbp_derived: number;
  raw: unknown;
}

/**
 * Fees as a positive magnitude. T212 reports charges as NEGATIVE quantities
 * (e.g. CURRENCY_CONVERSION_FEE -0.01), so the raw sum must be abs()'d before
 * downstream code adds it to a buy cost.
 */
function sumFees(item: T212OrderItem): number {
  const taxes = item.fill?.walletImpact?.taxes ?? [];
  return Math.abs(taxes.reduce((sum, tax) => sum + (tax.quantity ?? 0), 0));
}

function toUtcDate(iso: string): string {
  return new Date(iso).toISOString();
}

/**
 * `walletImpact.netValue` is the ALL-IN wallet movement, already net of fees in
 * both directions (verified against live data: a £5.00 buy debit = £4.99 of
 * shares + £0.01 fee; a £10.96 sell credit = £10.98 gross − £0.02 fee).
 *
 * Downstream (`metrics/holdings.ts`) expects `total_gbp` to be the GROSS share
 * value EXCLUDING fees, recombining it as `total + fees` on buys and
 * `total − fees` on sells. So strip the fee back out here — otherwise fees are
 * applied twice.
 */
function extractGrossGbp(
  item: T212OrderItem,
  accountCurrency: string,
  side: 'BUY' | 'SELL',
  feesGbp: number,
): number | null {
  const wallet = item.fill?.walletImpact;
  if (!wallet) return null;

  const netValue = wallet.netValue;
  if (netValue === undefined || netValue === null) return null;

  const walletCurrency = wallet.currency ?? accountCurrency;
  if (walletCurrency !== accountCurrency) return null;

  const allIn = Math.abs(netValue);
  return side === 'BUY' ? allIn - feesGbp : allIn + feesGbp;
}

export function normalizeOrder(
  item: T212OrderItem,
  accountCurrency = 'GBP',
  fxLookup?: FxLookup,
): NormalizedOrder | null {
  if (item.order.status !== 'FILLED' || !item.fill) return null;

  const ticker = item.order.ticker ?? item.order.instrument?.ticker;
  if (!ticker) return null;

  const side = item.order.side;
  const instrumentCurrency = item.order.instrument?.currency ?? item.order.currency ?? accountCurrency;
  const executedAt = toUtcDate(item.fill.filledAt);
  const date = executedAt.slice(0, 10);
  // Sell fills arrive with NEGATIVE quantity; store magnitude and let `side` carry direction.
  const quantity = Math.abs(item.fill.quantity);
  // LSE listings quote in pence (GBX): a 509.9 fill is £5.099. Yahoo bars are
  // stored in major units, so convert here or the average-cost line sits 100x
  // above the price line.
  const fillPriceLocal = toMajorUnits(item.fill.price, instrumentCurrency);
  const feesGbp = sumFees(item);

  let totalGbp = extractGrossGbp(item, accountCurrency, side, feesGbp);
  let gbpDerived = 0;

  // Fallbacks produce the gross notional directly, so no fee adjustment applies.
  if (totalGbp === null) {
    // fillPriceLocal is already in major units, so a pence listing is just GBP here.
    const majorCurrency = isPence(instrumentCurrency) ? 'GBP' : instrumentCurrency;
    const notionalLocal = Math.abs(quantity * fillPriceLocal);
    const lookupFx = fxLookup?.(instrumentCurrency, date);
    // T212's own execution rate (local units per account unit) is exact.
    const t212Fx = item.fill.walletImpact?.fxRate;

    if (majorCurrency === accountCurrency) {
      totalGbp = notionalLocal;
    } else if (lookupFx !== null && lookupFx !== undefined) {
      totalGbp = notionalLocal * lookupFx;
    } else if (t212Fx !== undefined && t212Fx !== null && t212Fx !== 0) {
      totalGbp = notionalLocal / t212Fx;
    } else {
      totalGbp = 0;
    }
    gbpDerived = 1;
  }

  return {
    id: String(item.fill.id),
    t212_ticker: ticker,
    side,
    executed_at: executedAt,
    quantity,
    fill_price_local: fillPriceLocal,
    total_gbp: totalGbp,
    fees_gbp: feesGbp,
    gbp_derived: gbpDerived,
    raw: item,
  };
}

export function normalizeOrders(
  items: T212OrderItem[],
  accountCurrency = 'GBP',
  fxLookup?: FxLookup,
): NormalizedOrder[] {
  return items
    .map((item) => normalizeOrder(item, accountCurrency, fxLookup))
    .filter((o): o is NormalizedOrder => o !== null);
}
