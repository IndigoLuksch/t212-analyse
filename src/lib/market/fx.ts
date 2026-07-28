import { getFxRate, getLatestFxDate, upsertFx, upsertFxBatch } from '@/lib/db';

// api.frankfurter.app now 301-redirects here; use the canonical host directly
// so every request doesn't pay an extra round trip.
const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v1';

interface FrankfurterRatesResponse {
  base: string;
  date: string;
  rates: Record<string, number>;
}

interface FrankfurterRangeResponse {
  base: string;
  start_date: string;
  end_date: string;
  rates: Record<string, Record<string, number>>;
}

/**
 * Symbols to request from the EUR-based endpoint. EUR and GBP are dropped
 * because they are derived (EUR is the base; GBP is the target), and GBX/GBp is
 * not a currency — pence prices are already converted to GBP major units.
 */
function symbolParam(symbols: string[]): string[] {
  return [
    ...new Set(
      symbols.filter((s) => s !== 'EUR' && s !== 'GBP' && s !== 'GBp' && s.toUpperCase() !== 'GBX'),
    ),
  ];
}

async function fetchFrankfurterRates(date: string, symbols: string[]): Promise<FrankfurterRatesResponse | null> {
  const filtered = symbolParam(symbols);
  const url = `${FRANKFURTER_BASE}/${date}?base=EUR&symbols=${[...filtered, 'GBP'].join(',')}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as FrankfurterRatesResponse;
  } catch {
    return null;
  }
}

/** One request covering a whole date range (business days only). */
async function fetchFrankfurterRange(
  start: string,
  end: string,
  symbols: string[],
): Promise<FrankfurterRangeResponse | null> {
  const filtered = symbolParam(symbols);
  const url = `${FRANKFURTER_BASE}/${start}..${end}?base=EUR&symbols=${[...filtered, 'GBP'].join(',')}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as FrankfurterRangeResponse;
  } catch {
    return null;
  }
}

function eurRatesToGbpPerUnit(rates: Record<string, number>): Record<string, number> {
  const gbpPerEur = rates.GBP;
  if (!gbpPerEur) return {};

  // EUR is the request's base, so it never appears in `rates` — its GBP rate is
  // exactly rates.GBP. Omitting it leaves every EUR-denominated position without
  // a conversion rate.
  const result: Record<string, number> = { GBP: 1, EUR: gbpPerEur };
  for (const [ccy, eurPerUnit] of Object.entries(rates)) {
    if (ccy === 'GBP') continue;
    if (eurPerUnit === 0) continue;
    result[ccy] = gbpPerEur / eurPerUnit;
  }
  return result;
}

export function gbpPerUnitFromEurRates(ccy: string, rates: Record<string, number>): number | null {
  if (ccy === 'GBP') return 1;
  const converted = eurRatesToGbpPerUnit(rates);
  return converted[ccy] ?? null;
}

export async function fetchAndStoreFx(date: string, currencies: string[]): Promise<number> {
  const needed = [...new Set(currencies.filter((c) => c !== 'GBP'))];
  if (needed.length === 0) {
    upsertFx({ date, ccy: 'GBP', gbp_per_unit: 1 });
    return 1;
  }

  const data = await fetchFrankfurterRates(date, needed);
  if (!data) return 0;

  const gbpRates = eurRatesToGbpPerUnit(data.rates);
  const rows = Object.entries(gbpRates).map(([ccy, gbp_per_unit]) => ({
    date: data.date,
    ccy,
    gbp_per_unit,
  }));
  upsertFxBatch(rows);
  return rows.length;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let current = start;
  while (current <= end) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

/**
 * Fetches the whole span in yearly chunks (one request each, rather than one per
 * calendar day) and forward-fills weekends/holidays from the last business day,
 * so every calendar date has a rate.
 */
export async function syncFxRange(
  currencies: string[],
  startDate: string,
  endDate: string,
  onProgress?: (current: number, total: number) => void,
): Promise<number> {
  const needed = [...new Set(currencies.filter((c) => c !== 'GBP'))];
  if (needed.length === 0) {
    const dates = dateRange(startDate, endDate);
    for (const date of dates) upsertFx({ date, ccy: 'GBP', gbp_per_unit: 1 });
    onProgress?.(1, 1);
    return dates.length;
  }

  // Chunk by calendar year: bounded response sizes and usable progress.
  const chunks: Array<{ start: string; end: string }> = [];
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  for (let y = startYear; y <= endYear; y += 1) {
    chunks.push({
      start: y === startYear ? startDate : `${y}-01-01`,
      end: y === endYear ? endDate : `${y}-12-31`,
    });
  }

  const businessRates = new Map<string, Record<string, number>>();
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i]!;
    const data = await fetchFrankfurterRange(chunk.start, chunk.end, needed);
    if (data?.rates) {
      for (const [date, rates] of Object.entries(data.rates)) {
        if (rates.GBP) businessRates.set(date, rates);
      }
    }
    onProgress?.(i + 1, chunks.length);
  }

  if (businessRates.size === 0) return 0;

  // Forward-fill across every calendar day in the span.
  const sortedBusinessDates = [...businessRates.keys()].sort();
  let stored = 0;
  let cursor = 0;
  let lastKnown: Record<string, number> | null = null;

  for (const date of dateRange(startDate, endDate)) {
    while (cursor < sortedBusinessDates.length && sortedBusinessDates[cursor]! <= date) {
      lastKnown = businessRates.get(sortedBusinessDates[cursor]!)!;
      cursor += 1;
    }
    if (!lastKnown) continue;
    for (const [ccy, gbp_per_unit] of Object.entries(eurRatesToGbpPerUnit(lastKnown))) {
      upsertFx({ date, ccy, gbp_per_unit });
      stored += 1;
    }
  }

  return stored;
}

export function createFxLookup(): (ccy: string, date: string) => number | null {
  return (ccy, date) => getFxRate(ccy, date);
}

export async function syncFxForCurrencies(
  currencies: string[],
  fromDate?: string,
  onProgress?: (current: number, total: number) => void,
): Promise<number> {
  const endDate = new Date().toISOString().slice(0, 10);
  // Currencies we STORE rates for (EUR included — it is derived from the base,
  // not requested as a symbol). Pence is not a currency.
  const stored = [
    ...new Set(currencies.filter((c) => c !== 'GBp' && c.toUpperCase() !== 'GBX')),
  ];
  const latest = stored.map((ccy) => getLatestFxDate(ccy));

  // A currency with no history at all needs the full range, not an incremental
  // top-up from where the others left off.
  const startDate =
    fromDate ??
    (stored.length === 0 || latest.some((d) => d === null)
      ? '2015-01-01'
      : [...latest].sort()[0]!);

  return syncFxRange(currencies, startDate, endDate, onProgress);
}
