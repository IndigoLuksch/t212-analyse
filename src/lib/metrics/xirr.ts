import type { CashFlow, XirrResult } from './types';
import { daysBetween } from './utils';

const MIN_RATE = -0.9999;
const MAX_RATE = 100;
const SUPPRESS_DAYS = 182;

function npv(rate: number, flows: CashFlow[], t0: number): number {
  let sum = 0;
  for (const f of flows) {
    const t = (Date.parse(`${f.date}T00:00:00Z`) - t0) / (365.25 * 86_400_000);
    sum += f.amountGbp / Math.pow(1 + rate, t);
  }
  return sum;
}

function npvDerivative(rate: number, flows: CashFlow[], t0: number): number {
  let sum = 0;
  for (const f of flows) {
    const t = (Date.parse(`${f.date}T00:00:00Z`) - t0) / (365.25 * 86_400_000);
    sum -= (t * f.amountGbp) / Math.pow(1 + rate, t + 1);
  }
  return sum;
}

function bisectXirr(flows: CashFlow[], t0: number): number | null {
  let lo = MIN_RATE;
  let hi = MAX_RATE;
  let fLo = npv(lo, flows, t0);
  let fHi = npv(hi, flows, t0);

  if (fLo * fHi > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, flows, t0);
    if (Math.abs(fMid) < 1e-12 || (hi - lo) / 2 < 1e-10) {
      return mid;
    }
    if (fLo * fMid <= 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

function newtonPolish(rate: number, flows: CashFlow[], t0: number): number {
  let r = rate;
  for (let i = 0; i < 20; i++) {
    const f = npv(r, flows, t0);
    const df = npvDerivative(r, flows, t0);
    if (Math.abs(df) < 1e-14) break;
    const next = r - f / df;
    if (!Number.isFinite(next) || next <= MIN_RATE) break;
    if (Math.abs(next - r) < 1e-12) return next;
    r = next;
  }
  return r;
}

function totalInvested(flows: CashFlow[]): number {
  return flows
    .filter((f) => f.amountGbp < 0)
    .reduce((s, f) => s + Math.abs(f.amountGbp), 0);
}

function totalReturned(flows: CashFlow[]): number {
  return flows
    .filter((f) => f.amountGbp > 0)
    .reduce((s, f) => s + f.amountGbp, 0);
}

/**
 * Money-weighted annual return.
 * Buys are negative flows; sells, dividends, terminal value are positive.
 */
export function computeXirr(flows: CashFlow[]): XirrResult {
  if (flows.length === 0) {
    return { xirr: null, totalReturn: 0, suppressAnnualised: false };
  }

  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = Date.parse(`${sorted[0].date}T00:00:00Z`);
  const tLast = Date.parse(`${sorted[sorted.length - 1].date}T00:00:00Z`);
  const spanDays = (tLast - t0) / 86_400_000;
  const suppressAnnualised = spanDays < SUPPRESS_DAYS;

  const invested = totalInvested(sorted);
  const returned = totalReturned(sorted);
  const totalReturn = invested > 0 ? (returned - invested) / invested : 0;

  // Total loss edge: all capital gone, no positive terminal recovery
  if (invested > 0 && returned < 1e-9) {
    return { xirr: -1, totalReturn: -1, suppressAnnualised };
  }

  const raw = bisectXirr(sorted, t0);
  if (raw === null) {
    return { xirr: null, totalReturn, suppressAnnualised };
  }

  const xirr = newtonPolish(raw, sorted, t0);
  return { xirr, totalReturn, suppressAnnualised };
}
