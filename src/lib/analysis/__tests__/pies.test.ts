import { describe, expect, it } from 'vitest';
import { attributeToPie } from '../pies';
import type { Order } from '@/lib/metrics';

let seq = 0;
function order(
  date: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  totalGbp: number,
): Order {
  seq += 1;
  return {
    id: `o${seq}`,
    t212Ticker: 'CTYl_EQ',
    side,
    executedAt: `${date}T12:00:00.000Z`,
    quantity,
    fillPriceLocal: totalGbp / quantity,
    totalGbp,
    feesGbp: 0,
  };
}

const CREATED = '2025-08-29';

describe('attributeToPie', () => {
  it('ignores everything before the pie existed', () => {
    const { fills, finalShares } = attributeToPie(
      [order('2024-02-16', 'BUY', 100, 500), order('2024-06-01', 'BUY', 50, 260)],
      [],
      CREATED,
    );
    expect(fills).toEqual([]);
    expect(finalShares).toBe(0);
  });

  it('credits post-creation buys to the pie', () => {
    const { fills, finalShares } = attributeToPie(
      [order('2025-09-01', 'BUY', 1.5, 7), order('2025-10-27', 'BUY', 1, 5)],
      [],
      CREATED,
    );
    expect(finalShares).toBeCloseTo(2.5, 10);
    expect(fills).toHaveLength(2);
    expect(fills.every((f) => f.side === 'BUY')).toBe(true);
  });

  it('drains the legacy sleeve before touching pie shares', () => {
    // 100 shares held at creation, 2 bought into the pie, then 100 sold.
    // The sale is the sleeve's; the pie keeps its 2.
    const { fills, finalShares } = attributeToPie(
      [
        order('2024-02-16', 'BUY', 100, 500),
        order('2025-09-01', 'BUY', 2, 11),
        order('2026-02-05', 'SELL', 100, 560),
      ],
      [],
      CREATED,
    );
    expect(finalShares).toBeCloseTo(2, 10);
    expect(fills.filter((f) => f.side === 'SELL')).toEqual([]);
  });

  it('spills into pie shares only once the sleeve is exhausted', () => {
    const { fills, finalShares } = attributeToPie(
      [
        order('2024-02-16', 'BUY', 100, 500),
        order('2025-09-01', 'BUY', 5, 28),
        // 2 more than the sleeve holds, so 2 come out of the pie.
        order('2026-02-05', 'SELL', 102, 580),
      ],
      [],
      CREATED,
    );
    expect(finalShares).toBeCloseTo(3, 10);
    const sells = fills.filter((f) => f.side === 'SELL');
    expect(sells).toHaveLength(1);
    expect(sells[0]!.pieQty).toBeCloseTo(2, 10);
    // Proceeds are prorated to the pie's slice of the fill: 2/102 of £580.
    expect(sells[0]!.cashGbp).toBeCloseTo((580 * 2) / 102, 6);
  });

  it('reproduces the real CTY sequence: sleeve liquidated, pie survives', () => {
    // The live City of London order history for this pie's ISA account: a
    // standalone sleeve of 194.4190761 shares built through 2024-25, pie
    // contributions from the creation date, and the Feb 2026 liquidation that
    // sold 195.2119385 — slightly more than the sleeve held, so the excess
    // comes out of the pie.
    const { finalShares } = attributeToPie(
      [
        order('2024-02-16', 'BUY', 194.4190761, 900),
        order('2025-08-29', 'BUY', 0.3129388, 1.56),
        order('2025-09-01', 'BUY', 1.378, 6.89),
        order('2025-09-10', 'BUY', 1.3667335, 6.82),
        order('2025-10-27', 'BUY', 1.1605416, 6.0),
        order('2025-11-28', 'BUY', 0.4799235, 2.51),
        order('2025-12-17', 'BUY', 0.5969868, 3.17),
        order('2026-02-05', 'SELL', 195.2119385, 1087.33),
        order('2026-02-27', 'BUY', 0.2683761, 1.57),
        order('2026-03-02', 'SELL', 0.2683761, 1.55),
        order('2026-03-02', 'BUY', 0.3760832, 2.17),
        order('2026-04-27', 'BUY', 1.2244165, 6.82),
        order('2026-05-26', 'BUY', 0.6942004, 3.95),
        order('2026-06-18', 'BUY', 0.2809187, 1.59),
      ],
      [],
      CREATED,
    );
    // Must land on T212's own reported ownedQuantity for this constituent.
    expect(finalShares).toBeCloseTo(7.07788061, 6);
  });

  it('treats a sleeve that was already flat as zero, not negative', () => {
    const { finalShares } = attributeToPie(
      [
        order('2024-02-16', 'BUY', 10, 50),
        order('2024-06-01', 'SELL', 10, 55),
        order('2025-09-01', 'BUY', 3, 17),
        order('2025-10-01', 'SELL', 1, 6),
      ],
      [],
      CREATED,
    );
    // The sleeve is empty at creation, so the later sell hits the pie.
    expect(finalShares).toBeCloseTo(2, 10);
  });
});
