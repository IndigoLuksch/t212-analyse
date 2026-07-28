import { migrate } from '../src/lib/db/migrate';
import {
  closeDb,
  getDb,
  upsertDivEvent,
  upsertDividend,
  upsertFx,
  upsertInstrument,
  upsertOrder,
  upsertPrice,
  upsertSplit,
  upsertTransaction,
} from '../src/lib/db';

/** Generate weekday prices from start→end with mild drift. */
function dailySeries(
  start: string,
  end: string,
  startPx: number,
  endPx: number,
): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  const t0 = Date.parse(`${start}T00:00:00Z`);
  const t1 = Date.parse(`${end}T00:00:00Z`);
  const days = Math.max(1, (t1 - t0) / 86_400_000);
  for (let t = t0; t <= t1; t += 86_400_000) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const frac = (t - t0) / (t1 - t0 || 1);
    const noise = Math.sin(frac * 40) * 0.015 + Math.cos(frac * 17) * 0.01;
    const px = startPx + (endPx - startPx) * frac + startPx * noise;
    out.push([d.toISOString().slice(0, 10), Math.round(px * 10000) / 10000]);
  }
  // ensure endpoints
  if (!out.some(([d]) => d === start)) out.unshift([start, startPx]);
  if (!out.some(([d]) => d === end)) out.push([end, endPx]);
  out.sort((a, b) => a[0].localeCompare(b[0]));
  return out;
}

function seed(): void {
  migrate();
  const db = getDb();
  db.exec(`
    DELETE FROM notes;
    DELETE FROM splits;
    DELETE FROM div_events;
    DELETE FROM prices;
    DELETE FROM fx;
    DELETE FROM transactions;
    DELETE FROM dividends;
    DELETE FROM orders;
    DELETE FROM instruments;
    DELETE FROM sync_state;
  `);

  upsertInstrument({
    t212_ticker: 'AAPL_US_EQ',
    isin: 'US0378331005',
    name: 'Apple Inc',
    currency: 'USD',
    yahoo_symbol: 'AAPL',
    yahoo_override: null,
    color_slot: 1,
    raw: { ticker: 'AAPL_US_EQ' },
  });

  upsertInstrument({
    t212_ticker: 'BARC_GB_EQ',
    isin: 'GB0031348658',
    name: 'Barclays PLC',
    currency: 'GBP',
    yahoo_symbol: 'BARC.L',
    yahoo_override: null,
    color_slot: 2,
    raw: { ticker: 'BARC_GB_EQ' },
  });

  upsertInstrument({
    t212_ticker: 'NVDA_US_EQ',
    isin: 'US67066G1040',
    name: 'NVIDIA Corp',
    currency: 'USD',
    yahoo_symbol: 'NVDA',
    yahoo_override: null,
    color_slot: 3,
    raw: { ticker: 'NVDA_US_EQ' },
  });

  // AAPL: accumulate, partial exit
  upsertOrder({
    id: 'seed-order-1',
    t212_ticker: 'AAPL_US_EQ',
    side: 'BUY',
    executed_at: '2023-06-15T14:30:00.000Z',
    quantity: 10,
    fill_price_local: 185.5,
    total_gbp: 1480,
    fees_gbp: 2.5,
    gbp_derived: 0,
    raw: {},
  });
  upsertOrder({
    id: 'seed-order-2',
    t212_ticker: 'AAPL_US_EQ',
    side: 'BUY',
    executed_at: '2023-09-01T14:30:00.000Z',
    quantity: 5,
    fill_price_local: 178.2,
    total_gbp: 720,
    fees_gbp: 1.2,
    gbp_derived: 0,
    raw: {},
  });
  upsertOrder({
    id: 'seed-order-3',
    t212_ticker: 'AAPL_US_EQ',
    side: 'SELL',
    executed_at: '2024-03-10T15:00:00.000Z',
    quantity: 3,
    fill_price_local: 172.4,
    total_gbp: 410,
    fees_gbp: 1,
    gbp_derived: 0,
    raw: {},
  });

  // BARC: closed round trip (after split)
  upsertOrder({
    id: 'seed-order-4',
    t212_ticker: 'BARC_GB_EQ',
    side: 'BUY',
    executed_at: '2023-01-10T08:00:00.000Z',
    quantity: 500,
    fill_price_local: 1.65,
    total_gbp: 825.5,
    fees_gbp: 0.5,
    gbp_derived: 0,
    raw: {},
  });
  upsertOrder({
    id: 'seed-order-5',
    t212_ticker: 'BARC_GB_EQ',
    side: 'BUY',
    executed_at: '2023-04-20T08:00:00.000Z',
    quantity: 200,
    fill_price_local: 1.58,
    total_gbp: 316.2,
    fees_gbp: 0.2,
    gbp_derived: 0,
    raw: {},
  });
  upsertOrder({
    id: 'seed-order-6',
    t212_ticker: 'BARC_GB_EQ',
    side: 'SELL',
    executed_at: '2024-06-15T08:00:00.000Z',
    quantity: 1400, // post 2:1 split basis if stored pre-split qty would differ; seed uses post-adj qty for simplicity
    fill_price_local: 2.05,
    total_gbp: 2860,
    fees_gbp: 1.5,
    gbp_derived: 0,
    raw: {},
  });

  // NVDA: redeploy after AAPL partial sell
  upsertOrder({
    id: 'seed-order-7',
    t212_ticker: 'NVDA_US_EQ',
    side: 'BUY',
    executed_at: '2024-03-20T15:00:00.000Z',
    quantity: 2,
    fill_price_local: 900,
    total_gbp: 1420,
    fees_gbp: 2,
    gbp_derived: 0,
    raw: {},
  });

  upsertDividend({
    id: 'seed-div-1',
    t212_ticker: 'AAPL_US_EQ',
    paid_at: '2023-08-15T00:00:00.000Z',
    amount_gbp: 3.42,
    raw: {},
  });
  upsertDividend({
    id: 'seed-div-2',
    t212_ticker: 'BARC_GB_EQ',
    paid_at: '2023-09-22T00:00:00.000Z',
    amount_gbp: 12.5,
    raw: {},
  });

  upsertTransaction({
    id: 'seed-tx-1',
    type: 'DEPOSIT',
    occurred_at: '2023-01-01T10:00:00.000Z',
    amount_gbp: 5000,
    raw: {},
  });
  upsertTransaction({
    id: 'seed-tx-2',
    type: 'DEPOSIT',
    occurred_at: '2023-06-01T10:00:00.000Z',
    amount_gbp: 2000,
    raw: {},
  });

  const asOf = '2025-06-01';
  for (const [date, close] of dailySeries('2023-06-01', asOf, 185.5, 200)) {
    upsertPrice({ yahoo_symbol: 'AAPL', date, close_local: close });
  }
  for (const [date, close] of dailySeries('2023-01-01', asOf, 1.65, 2.45)) {
    upsertPrice({ yahoo_symbol: 'BARC.L', date, close_local: close });
  }
  for (const [date, close] of dailySeries('2024-03-01', asOf, 900, 1200)) {
    upsertPrice({ yahoo_symbol: 'NVDA', date, close_local: close });
  }
  for (const [date, close] of dailySeries('2023-01-01', asOf, 82.5, 115)) {
    upsertPrice({ yahoo_symbol: 'VWRP.L', date, close_local: close });
  }

  upsertSplit({
    yahoo_symbol: 'BARC.L',
    date: '2024-01-15',
    numerator: 2,
    denominator: 1,
  });

  upsertDivEvent({ yahoo_symbol: 'AAPL', date: '2023-08-10', per_share_local: 0.24 });
  upsertDivEvent({ yahoo_symbol: 'BARC.L', date: '2023-09-20', per_share_local: 0.025 });

  // Daily FX approx
  for (const [date] of dailySeries('2023-01-01', asOf, 1, 1)) {
    const frac =
      (Date.parse(`${date}T00:00:00Z`) - Date.parse('2023-01-01T00:00:00Z')) /
      (Date.parse(`${asOf}T00:00:00Z`) - Date.parse('2023-01-01T00:00:00Z'));
    const rate = 0.81 - frac * 0.035 + Math.sin(frac * 20) * 0.008;
    upsertFx({ date, ccy: 'USD', gbp_per_unit: Math.round(rate * 10000) / 10000 });
    upsertFx({ date, ccy: 'GBP', gbp_per_unit: 1 });
  }

  // Mark seed as "synced" so the pill shows a time
  db.prepare(
    `INSERT INTO sync_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(
    'last_sync_summary',
    JSON.stringify({ completedAt: new Date().toISOString(), seed: true }),
  );

  console.log('Seed complete');
  closeDb();
}

seed();
