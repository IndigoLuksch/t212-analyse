import YahooFinance from 'yahoo-finance2';
import { getInstrument, setInstrumentYahooSymbol } from '@/lib/db';

const yahooFinance = new YahooFinance();

/**
 * T212 encodes the exchange as a lowercase letter appended to the symbol, e.g.
 * `BPl_EQ` (London), `ADSd_EQ` (Xetra), `SHELLa_EQ` (Amsterdam). US listings use
 * an explicit `_US_` segment instead: `CELH_US_EQ`, `ELF_EQ_US`.
 */
const MARKET_LETTER_SUFFIX: Record<string, string> = {
  l: '.L', // London
  d: '.DE', // Xetra
  a: '.AS', // Amsterdam
  p: '.PA', // Paris
  m: '.MI', // Milan
  e: '.MC', // Madrid
  s: '.SW', // Swiss
  h: '.HE', // Helsinki
  c: '.CO', // Copenhagen
  o: '.OL', // Oslo
  t: '.ST', // Stockholm
  b: '.BR', // Brussels
  v: '.VI', // Vienna
  w: '.WA', // Warsaw
};

export interface MappingResult {
  yahooSymbol: string | null;
  source: 'override' | 'heuristic' | 'isin_search' | 'failed';
  error?: string;
}

/** Yahoo exchange suffix for a T212 ticker ('' for US, null if unrecognised). */
export function marketSuffix(t212Ticker: string): string | null {
  const parts = t212Ticker.split('_');
  if (parts.includes('US')) return '';

  const base = parts[0] ?? '';
  const lastChar = base.slice(-1);
  // A trailing lowercase letter on an otherwise uppercase symbol is the market code.
  if (lastChar && lastChar >= 'a' && lastChar <= 'z') {
    return MARKET_LETTER_SUFFIX[lastChar] ?? null;
  }
  return null;
}

/** Symbol stripped of its T212 market decoration, e.g. `BPl_EQ` → `BP`. */
function baseSymbolFromTicker(t212Ticker: string): string {
  const base = t212Ticker.split('_')[0] ?? '';
  const lastChar = base.slice(-1);
  return lastChar && lastChar >= 'a' && lastChar <= 'z' ? base.slice(0, -1) : base;
}

/**
 * Prefers T212's `shortName` (kept in the stored raw payload) over the ticker,
 * because the ticker preserves the symbol at the time of listing while
 * shortName tracks renames — FB→META, IPOE→SOFI, LSE→LSEG — and Yahoo only
 * knows the current one.
 */
export function heuristicYahooSymbol(t212Ticker: string, shortName?: string | null): string | null {
  const suffix = marketSuffix(t212Ticker);
  if (suffix === null) return null;
  const symbol = shortName && shortName.trim() ? shortName.trim() : baseSymbolFromTicker(t212Ticker);
  if (!symbol) return null;
  return `${symbol}${suffix}`;
}

/** T212 stores the full instrument payload; pull shortName back out of it. */
function shortNameFromRaw(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as { shortName?: unknown };
    return typeof parsed.shortName === 'string' ? parsed.shortName : null;
  } catch {
    return null;
  }
}

function normalizeCurrency(currency: string): string {
  if (currency === 'GBp' || currency === 'GBX') return 'GBP';
  return currency;
}

async function validateSymbolCurrency(
  yahooSymbol: string,
  expectedCurrency: string,
): Promise<boolean> {
  try {
    const result = await yahooFinance.chart(yahooSymbol, {
      period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      interval: '1d',
    });
    const yahooCurrency = result.meta.currency;
    const expected = normalizeCurrency(expectedCurrency);
    const actual = normalizeCurrency(yahooCurrency);
    return actual === expected;
  } catch {
    return false;
  }
}

async function searchByIsin(isin: string, expectedCurrency: string): Promise<string | null> {
  try {
    const results = await yahooFinance.search(isin);
    for (const quote of results.quotes ?? []) {
      const symbol = typeof quote.symbol === 'string' ? quote.symbol : null;
      if (!symbol) continue;
      const valid = await validateSymbolCurrency(symbol, expectedCurrency);
      if (valid) return symbol;
    }
    return null;
  } catch {
    return null;
  }
}

export async function mapInstrumentToYahoo(t212Ticker: string): Promise<MappingResult> {
  const instrument = getInstrument(t212Ticker);
  if (!instrument) {
    return { yahooSymbol: null, source: 'failed', error: 'Instrument not found in DB' };
  }

  if (instrument.yahoo_override) {
    const valid = await validateSymbolCurrency(instrument.yahoo_override, instrument.currency ?? 'GBP');
    if (valid) {
      setInstrumentYahooSymbol(t212Ticker, instrument.yahoo_override);
      return { yahooSymbol: instrument.yahoo_override, source: 'override' };
    }
  }

  if (instrument.yahoo_symbol) {
    const valid = await validateSymbolCurrency(instrument.yahoo_symbol, instrument.currency ?? 'GBP');
    if (valid) {
      return { yahooSymbol: instrument.yahoo_symbol, source: 'heuristic' };
    }
  }

  const shortName = shortNameFromRaw(instrument.raw);
  const candidates = [
    heuristicYahooSymbol(t212Ticker, shortName),
    // Fall back to the ticker-derived symbol when shortName disagrees.
    heuristicYahooSymbol(t212Ticker, null),
  ].filter((s): s is string => Boolean(s));

  for (const candidate of [...new Set(candidates)]) {
    const valid = await validateSymbolCurrency(candidate, instrument.currency ?? 'GBP');
    if (valid) {
      setInstrumentYahooSymbol(t212Ticker, candidate);
      return { yahooSymbol: candidate, source: 'heuristic' };
    }
  }
  const heuristic = candidates[0] ?? null;

  if (instrument.isin) {
    const fromSearch = await searchByIsin(instrument.isin, instrument.currency ?? 'GBP');
    if (fromSearch) {
      setInstrumentYahooSymbol(t212Ticker, fromSearch);
      return { yahooSymbol: fromSearch, source: 'isin_search' };
    }
  }

  return {
    yahooSymbol: instrument.yahoo_symbol ?? heuristic,
    source: 'failed',
    error: 'Could not validate Yahoo symbol for instrument currency',
  };
}

export async function mapAllInstruments(
  onProgress?: (current: number, total: number) => void,
): Promise<Map<string, MappingResult>> {
  // Traded instruments only — mapping the full ~17k catalogue would mean one
  // Yahoo request each.
  const { getTradedInstruments } = await import('@/lib/db');
  const instruments = getTradedInstruments();
  const results = new Map<string, MappingResult>();

  for (let i = 0; i < instruments.length; i += 1) {
    const inst = instruments[i]!;
    const result = await mapInstrumentToYahoo(inst.t212_ticker);
    results.set(inst.t212_ticker, result);
    onProgress?.(i + 1, instruments.length);
  }

  return results;
}

export function clearMappingForOverride(t212Ticker: string): void {
  setInstrumentYahooSymbol(t212Ticker, null);
}
