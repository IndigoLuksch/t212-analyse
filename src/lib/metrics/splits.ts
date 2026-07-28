import type { Order, Split } from './types';
import { toUtcDate } from './utils';

/** Product of split ratios for splits with date strictly after orderDate. */
export function splitFactorAfter(orderDate: string, splits: Split[]): number {
  let factor = 1;
  for (const s of splits) {
    if (s.date > orderDate) {
      factor *= s.numerator / s.denominator;
    }
  }
  return factor;
}

/** Express order quantity and price in current share basis. */
export function adjustOrder(
  order: Order,
  splits: Split[],
): { adjQty: number; adjPrice: number } {
  const orderDate = toUtcDate(order.executedAt);
  const factor = splitFactorAfter(orderDate, splits);
  return {
    adjQty: order.quantity * factor,
    adjPrice: order.fillPriceLocal / factor,
  };
}
