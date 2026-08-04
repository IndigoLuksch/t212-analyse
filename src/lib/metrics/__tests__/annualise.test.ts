import { describe, expect, it } from 'vitest';
import { annualiseReturn, yearsBetween } from '../annualise';

describe('annualiseReturn', () => {
  it('compounds a multi-year return down to an annual rate', () => {
    // +21% over 2 years is 10%/yr compounded.
    const r = annualiseReturn(0.21, 2);
    expect(r.suppressed).toBe(false);
    expect(r.annualised).toBeCloseTo(0.1, 6);
  });

  it('leaves a one-year return unchanged', () => {
    expect(annualiseReturn(0.17, 1).annualised).toBeCloseTo(0.17, 10);
  });

  it('refuses to extrapolate a span under the annualisation floor', () => {
    // Six weeks at +8% would annualise to over +90%/yr.
    const r = annualiseReturn(0.08, 42 / 365.25);
    expect(r.suppressed).toBe(true);
    expect(r.annualised).toBeNull();
    expect(r.total).toBe(0.08);
  });

  it('annualises a loss', () => {
    const r = annualiseReturn(-0.19, 2);
    expect(r.annualised).toBeCloseTo(-0.1, 6);
  });

  it('refuses a total wipeout, which has no finite annual rate', () => {
    expect(annualiseReturn(-1, 3).annualised).toBeNull();
  });

  it('measures years on the same basis as XIRR', () => {
    // 2024 is a leap year, so this span is 366 days on a 365.25-day year.
    expect(yearsBetween('2024-01-01', '2025-01-01')).toBeCloseTo(366 / 365.25, 6);
    expect(yearsBetween('2025-01-01', '2026-01-01')).toBeCloseTo(365 / 365.25, 6);
  });
});
