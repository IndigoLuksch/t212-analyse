import YahooFinance from 'yahoo-finance2';
import {
  getLatestPriceDate,
  upsertDivEvent,
  upsertPrice,
  upsertSplit,
} from '@/lib/db';

const yahooFinance = new YahooFinance();

export interface YahooBar {
  date: string;
  close: number;
}

export interface YahooDivEvent {
  date: string;
  perShare: number;
}

export interface YahooSplitEvent {
  date: string;
  numerator: number;
  denominator: number;
}

export interface YahooChartSyncResult {
  symbol: string;
  bars: YahooBar[];
  dividends: YahooDivEvent[];
  splits: YahooSplitEvent[];
  currency: string;
  stale: boolean;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isPenceCurrency(currency: string): boolean {
  return currency === 'GBp' || currency === 'GBX';
}

function toMajorUnits(value: number, currency: string): number {
  return isPenceCurrency(currency) ? value / 100 : value;
}

export async function fetchYahooChart(
  symbol: string,
  period1: string,
  period2?: string,
): Promise<YahooChartSyncResult> {
  const period2Date = period2 ?? formatDate(new Date());

  try {
    const result = await yahooFinance.chart(symbol, {
      period1,
      period2: period2Date,
      interval: '1d',
      events: 'div|split',
    });

    const currency = result.meta.currency;
    const bars: YahooBar[] = [];
    for (const quote of result.quotes) {
      if (quote.close === null || quote.close === undefined) continue;
      bars.push({
        date: formatDate(quote.date),
        close: toMajorUnits(quote.close, currency),
      });
    }

    const dividends: YahooDivEvent[] = [];
    if (result.events?.dividends) {
      for (const div of result.events.dividends) {
        dividends.push({
          date: formatDate(div.date),
          perShare: toMajorUnits(div.amount, currency),
        });
      }
    }

    const splits: YahooSplitEvent[] = [];
    if (result.events?.splits) {
      for (const split of result.events.splits) {
        splits.push({
          date: formatDate(split.date),
          numerator: split.numerator,
          denominator: split.denominator,
        });
      }
    }

    return { symbol, bars, dividends, splits, currency, stale: false };
  } catch {
    return { symbol, bars: [], dividends: [], splits: [], currency: 'UNKNOWN', stale: true };
  }
}

export async function syncYahooSymbol(
  symbol: string,
  fromDate?: string,
): Promise<YahooChartSyncResult> {
  const latest = getLatestPriceDate(symbol);
  const startDate = fromDate ?? latest ?? '2015-01-01';

  const result = await fetchYahooChart(symbol, startDate);
  if (!result.stale) {
    for (const bar of result.bars) {
      upsertPrice({ yahoo_symbol: symbol, date: bar.date, close_local: bar.close });
    }
    for (const div of result.dividends) {
      upsertDivEvent({ yahoo_symbol: symbol, date: div.date, per_share_local: div.perShare });
    }
    for (const split of result.splits) {
      upsertSplit({
        yahoo_symbol: symbol,
        date: split.date,
        numerator: split.numerator,
        denominator: split.denominator,
      });
    }
  }

  return result;
}

export async function getQuoteCurrency(symbol: string): Promise<string | null> {
  try {
    const result = await yahooFinance.chart(symbol, {
      period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      interval: '1d',
    });
    return result.meta.currency;
  } catch {
    return null;
  }
}
