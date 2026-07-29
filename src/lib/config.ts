export const BENCHMARK_YAHOO = 'VWRP.L'; // switchable
export const BENCHMARK_FALLBACK_YAHOO = 'VWRL.L';
export const T212_BASE_URL = process.env.T212_BASE_URL ?? 'https://live.trading212.com';
export const MIN_REQUEST_SPACING_MS = 2000;
export const EXIT_MERGE_GAP_DAYS = 7;
/** Sell-then-rebuy inside this window is churn, not an exit — one trip, not two. */
export const FLIP_MERGE_GAP_DAYS = 1;
export const XIRR_MIN_SPAN_DAYS = 182;
export const DUST_ABS = 1e-6;
export const DUST_REL = 1e-4;
