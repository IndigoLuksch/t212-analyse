export const BENCHMARK_YAHOO = 'VWRP.L'; // switchable
export const BENCHMARK_FALLBACK_YAHOO = 'VWRL.L';

/**
 * Second reference line on every benchmarked chart.
 *
 * A GBP accumulating S&P 500 ETF rather than the `^GSPC` index: accumulating so
 * it carries dividends like the All-World benchmark does, and GBP-denominated so
 * both lines are measured the same way as the portfolio, with no FX leg to make
 * the comparison depend on when the conversion is struck.
 */
export const BENCHMARK_SP500_YAHOO = 'VUAG.L';
export const BENCHMARK_SP500_FALLBACK_YAHOO = 'CSP1.L';
export const T212_BASE_URL = process.env.T212_BASE_URL ?? 'https://live.trading212.com';
export const MIN_REQUEST_SPACING_MS = 2000;
export const EXIT_MERGE_GAP_DAYS = 7;
export const XIRR_MIN_SPAN_DAYS = 182;
export const DUST_ABS = 1e-6;
export const DUST_REL = 1e-4;
