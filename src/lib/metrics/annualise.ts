import { XIRR_MIN_SPAN_DAYS } from '@/lib/config';

const DAYS_PER_YEAR = 365.25;

export interface AnnualisedReturn {
  /** Compound annual rate, or null when the span is too short to annualise. */
  annualised: number | null;
  /** The cumulative return it was derived from, always available. */
  total: number;
  holdYears: number;
  /**
   * True when the span is under the annualisation floor. Callers show the
   * cumulative figure instead rather than a number nobody should act on.
   */
  suppressed: boolean;
}

/**
 * Compound annual rate from a cumulative return over `holdYears`.
 *
 * Short spans are refused rather than extrapolated. Six weeks at +8% annualises
 * to over +90%/yr, which says far more about the window than the holding, so
 * anything under the same floor XIRR uses is reported as cumulative instead.
 *
 * A total return of −100% (a position worth nothing) has no finite annual rate,
 * so it is refused too.
 */
export function annualiseReturn(
  totalReturn: number,
  holdYears: number,
): AnnualisedReturn {
  const minYears = XIRR_MIN_SPAN_DAYS / DAYS_PER_YEAR;
  const suppressed =
    !Number.isFinite(totalReturn) ||
    !Number.isFinite(holdYears) ||
    holdYears < minYears ||
    totalReturn <= -1;

  return {
    annualised: suppressed
      ? null
      : Math.pow(1 + totalReturn, 1 / holdYears) - 1,
    total: totalReturn,
    holdYears,
    suppressed,
  };
}

/** Calendar years between two ISO dates, on the same 365.25-day basis as XIRR. */
export function yearsBetween(fromDate: string, toDate: string): number {
  return (
    (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) /
    (DAYS_PER_YEAR * 86_400_000)
  );
}
