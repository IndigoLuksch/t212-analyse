import { describe, expect, it } from 'vitest';
import { normalizeOrder, normalizeOrders } from '../normalize';
import type { T212OrderItem } from '../client';

/**
 * Fixtures are REAL payloads captured from the live T212 account (2026-07-28).
 * The conventions they encode are not obvious and previously caused silent
 * mis-costing:
 *   - sell fills carry a NEGATIVE quantity
 *   - fees/taxes are reported as NEGATIVE quantities
 *   - walletImpact.netValue is the ALL-IN wallet movement, already net of fees
 */

// £5.00 debit = £4.99 of shares + £0.01 conversion fee.
const buyCelh = {
  order: {
    id: 54852042313,
    ticker: 'CELH_US_EQ',
    status: 'FILLED',
    currency: 'GBP',
    side: 'BUY',
    instrument: { ticker: 'CELH_US_EQ', name: 'Celsius', isin: 'US15118V2079', currency: 'USD' },
  },
  fill: {
    id: 54852043959,
    quantity: 0.23011523,
    price: 28.8,
    filledAt: '2026-07-28T11:00:16.000Z',
    walletImpact: {
      currency: 'GBP',
      netValue: 5.0,
      fxRate: 1.32811996,
      taxes: [{ name: 'CURRENCY_CONVERSION_FEE', quantity: -0.01, currency: 'GBP' }],
    },
  },
} as unknown as T212OrderItem;

// £10.96 credit = £10.98 gross proceeds − £0.02 conversion fee.
const sellUber = {
  order: {
    id: 1,
    ticker: 'UBER_US_EQ',
    status: 'FILLED',
    currency: 'GBP',
    side: 'SELL',
    instrument: { ticker: 'UBER_US_EQ', name: 'Uber', currency: 'USD' },
  },
  fill: {
    id: 2,
    quantity: -0.213276,
    price: 68.35,
    filledAt: '2026-07-20T15:00:00.000Z',
    walletImpact: {
      currency: 'GBP',
      netValue: 10.96,
      fxRate: 1.32763444,
      taxes: [{ name: 'CURRENCY_CONVERSION_FEE', quantity: -0.02, currency: 'GBP' }],
    },
  },
} as unknown as T212OrderItem;

// No fee charged at all.
const buyIpoe = {
  order: {
    id: 3,
    ticker: 'IPOE_US_EQ',
    status: 'FILLED',
    currency: 'GBP',
    side: 'BUY',
    instrument: { ticker: 'IPOE_US_EQ', currency: 'USD' },
  },
  fill: {
    id: 4,
    quantity: 0.145815,
    price: 16.76,
    filledAt: '2026-07-01T15:00:00.000Z',
    walletImpact: { currency: 'GBP', netValue: 1.84, fxRate: 1.32817999, taxes: [] },
  },
} as unknown as T212OrderItem;

describe('T212 order normalization', () => {
  it('stores sell quantity as a positive magnitude', () => {
    const sell = normalizeOrder(sellUber)!;
    expect(sell.quantity).toBeCloseTo(0.213276, 8);
    expect(sell.side).toBe('SELL');
  });

  it('records fees as a positive magnitude despite negative API values', () => {
    expect(normalizeOrder(buyCelh)!.fees_gbp).toBeCloseTo(0.01, 8);
    expect(normalizeOrder(sellUber)!.fees_gbp).toBeCloseTo(0.02, 8);
    expect(normalizeOrder(buyIpoe)!.fees_gbp).toBe(0);
  });

  it('stores total_gbp gross of fees so holdings can recombine without double-counting', () => {
    // Buy: gross share cost, fee excluded (4.99, not the 5.00 all-in debit).
    const buy = normalizeOrder(buyCelh)!;
    expect(buy.total_gbp).toBeCloseTo(4.99, 6);
    // Sell: gross proceeds, fee added back (10.98, not the 10.96 net credit).
    const sell = normalizeOrder(sellUber)!;
    expect(sell.total_gbp).toBeCloseTo(10.98, 6);
  });

  it('recombines to the exact wallet movement the way holdings.ts does', () => {
    const buy = normalizeOrder(buyCelh)!;
    const sell = normalizeOrder(sellUber)!;
    // holdings.ts: buys cost total + fees; sells yield total − fees.
    expect(buy.total_gbp + buy.fees_gbp).toBeCloseTo(5.0, 6);
    expect(sell.total_gbp - sell.fees_gbp).toBeCloseTo(10.96, 6);
  });

  it('matches the local notional converted at T212 execution rate', () => {
    const buy = normalizeOrder(buyCelh)!;
    const notionalGbp = (0.23011523 * 28.8) / 1.32811996;
    expect(buy.total_gbp).toBeCloseTo(notionalGbp, 2);
  });

  it('fees make a buy cost more and a sell yield less', () => {
    const buy = normalizeOrder(buyCelh)!;
    const sell = normalizeOrder(sellUber)!;
    expect(buy.total_gbp + buy.fees_gbp).toBeGreaterThan(buy.total_gbp);
    expect(sell.total_gbp - sell.fees_gbp).toBeLessThan(sell.total_gbp);
  });

  it('handles a fee-free fill', () => {
    const buy = normalizeOrder(buyIpoe)!;
    expect(buy.total_gbp).toBeCloseTo(1.84, 6);
    expect(buy.gbp_derived).toBe(0);
  });

  it('skips unfilled orders', () => {
    const pending = {
      order: { id: 9, ticker: 'X_US_EQ', status: 'CANCELLED', side: 'BUY' },
    } as unknown as T212OrderItem;
    expect(normalizeOrder(pending)).toBeNull();
    expect(normalizeOrders([pending, buyCelh])).toHaveLength(1);
  });

  it('derives GBP from the T212 fx rate when walletImpact currency is not the account currency', () => {
    const foreignWallet = {
      ...buyCelh,
      fill: {
        ...(buyCelh as never as { fill: Record<string, unknown> }).fill,
        walletImpact: { currency: 'USD', netValue: 6.63, fxRate: 1.32811996, taxes: [] },
      },
    } as unknown as T212OrderItem;
    const order = normalizeOrder(foreignWallet)!;
    expect(order.gbp_derived).toBe(1);
    expect(order.total_gbp).toBeCloseTo((0.23011523 * 28.8) / 1.32811996, 6);
  });
});
