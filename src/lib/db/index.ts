import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export interface InstrumentRow {
  t212_ticker: string;
  isin: string | null;
  name: string | null;
  currency: string | null;
  yahoo_symbol: string | null;
  yahoo_override: string | null;
  color_slot: number | null;
  raw: string | null;
}

export interface OrderRow {
  id: string;
  /** Config slug of the T212 account this row came from. Provenance only — reads never filter on it. */
  account_id: string;
  t212_ticker: string;
  side: 'BUY' | 'SELL';
  executed_at: string;
  quantity: number;
  fill_price_local: number;
  total_gbp: number;
  fees_gbp: number;
  gbp_derived: number;
  raw: string | null;
}

export interface DividendRow {
  id: string;
  account_id: string;
  t212_ticker: string;
  paid_at: string;
  amount_gbp: number;
  raw: string | null;
}

export interface TransactionRow {
  id: string;
  account_id: string;
  type: string;
  occurred_at: string;
  amount_gbp: number;
  raw: string | null;
}

export interface PriceRow {
  yahoo_symbol: string;
  date: string;
  close_local: number;
}

export interface DivEventRow {
  yahoo_symbol: string;
  date: string;
  per_share_local: number;
}

export interface SplitRow {
  yahoo_symbol: string;
  date: string;
  numerator: number;
  denominator: number;
}

export interface FxRow {
  date: string;
  ccy: string;
  gbp_per_unit: number;
}

export interface NoteRow {
  order_id: string;
  text: string;
  updated_at: string;
}

let dbInstance: Database.Database | null = null;

function dbPath(): string {
  const dir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'app.db');
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(dbPath());
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// --- sync_state ---

export function getSyncState(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM sync_state WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSyncState(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value);
}

export function deleteSyncState(key: string): void {
  getDb().prepare('DELETE FROM sync_state WHERE key = ?').run(key);
}

// --- instruments ---

export function upsertInstrument(row: Omit<InstrumentRow, 'raw'> & { raw?: unknown }): void {
  getDb()
    .prepare(
      `INSERT INTO instruments (t212_ticker, isin, name, currency, yahoo_symbol, yahoo_override, color_slot, raw)
       VALUES (@t212_ticker, @isin, @name, @currency, @yahoo_symbol, @yahoo_override, @color_slot, @raw)
       ON CONFLICT(t212_ticker) DO UPDATE SET
         isin = excluded.isin,
         name = excluded.name,
         currency = excluded.currency,
         yahoo_symbol = COALESCE(excluded.yahoo_symbol, instruments.yahoo_symbol),
         yahoo_override = COALESCE(excluded.yahoo_override, instruments.yahoo_override),
         color_slot = COALESCE(excluded.color_slot, instruments.color_slot),
         raw = excluded.raw`,
    )
    .run({
      ...row,
      raw: row.raw !== undefined ? JSON.stringify(row.raw) : null,
    });
}

/**
 * Batched catalogue upsert. The instruments endpoint returns ~17k rows and is
 * now fetched once per account, so one transaction beats 17k×N implicit ones.
 */
export function upsertInstruments(
  rows: Array<Omit<InstrumentRow, 'raw'> & { raw?: unknown }>,
): void {
  const stmt = getDb().prepare(
    `INSERT INTO instruments (t212_ticker, isin, name, currency, yahoo_symbol, yahoo_override, color_slot, raw)
     VALUES (@t212_ticker, @isin, @name, @currency, @yahoo_symbol, @yahoo_override, @color_slot, @raw)
     ON CONFLICT(t212_ticker) DO UPDATE SET
       isin = excluded.isin,
       name = excluded.name,
       currency = excluded.currency,
       yahoo_symbol = COALESCE(excluded.yahoo_symbol, instruments.yahoo_symbol),
       yahoo_override = COALESCE(excluded.yahoo_override, instruments.yahoo_override),
       color_slot = COALESCE(excluded.color_slot, instruments.color_slot),
       raw = excluded.raw`,
  );
  const tx = getDb().transaction((batch: Array<Omit<InstrumentRow, 'raw'> & { raw?: unknown }>) => {
    for (const row of batch) {
      stmt.run({ ...row, raw: row.raw !== undefined ? JSON.stringify(row.raw) : null });
    }
  });
  tx(rows);
}

export function getInstrument(t212Ticker: string): InstrumentRow | null {
  return (
    (getDb()
      .prepare('SELECT * FROM instruments WHERE t212_ticker = ?')
      .get(t212Ticker) as InstrumentRow | undefined) ?? null
  );
}

export function getAllInstruments(): InstrumentRow[] {
  return getDb().prepare('SELECT * FROM instruments ORDER BY t212_ticker').all() as InstrumentRow[];
}

/**
 * Instruments the account has actually traded or been paid a dividend by.
 *
 * T212's catalogue endpoint returns every tradeable instrument (~17k), but only
 * a few dozen are ever held. Every market-data path must scope to these — a
 * Yahoo request per catalogue entry would take hours and get rate-limited.
 */
export function getTradedInstruments(): InstrumentRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM instruments
       WHERE t212_ticker IN (SELECT DISTINCT t212_ticker FROM orders)
          OR t212_ticker IN (SELECT DISTINCT t212_ticker FROM dividends)
       ORDER BY t212_ticker`,
    )
    .all() as InstrumentRow[];
}

export function setInstrumentYahooSymbol(t212Ticker: string, yahooSymbol: string | null): void {
  getDb()
    .prepare('UPDATE instruments SET yahoo_symbol = ? WHERE t212_ticker = ?')
    .run(yahooSymbol, t212Ticker);
}

export function setInstrumentYahooOverride(t212Ticker: string, yahooOverride: string | null): void {
  getDb()
    .prepare('UPDATE instruments SET yahoo_override = ?, yahoo_symbol = NULL WHERE t212_ticker = ?')
    .run(yahooOverride, t212Ticker);
}

export function setInstrumentColorSlot(t212Ticker: string, colorSlot: number | null): void {
  getDb()
    .prepare('UPDATE instruments SET color_slot = ? WHERE t212_ticker = ?')
    .run(colorSlot, t212Ticker);
}

// --- orders ---

export function upsertOrder(
  row: Omit<OrderRow, 'raw' | 'gbp_derived' | 'account_id'> & {
    account_id?: string;
    gbp_derived?: number;
    raw?: unknown;
  },
): void {
  getDb()
    .prepare(
      `INSERT INTO orders (id, account_id, t212_ticker, side, executed_at, quantity, fill_price_local, total_gbp, fees_gbp, gbp_derived, raw)
       VALUES (@id, @account_id, @t212_ticker, @side, @executed_at, @quantity, @fill_price_local, @total_gbp, @fees_gbp, @gbp_derived, @raw)
       ON CONFLICT(id) DO UPDATE SET
         account_id = excluded.account_id,
         t212_ticker = excluded.t212_ticker,
         side = excluded.side,
         executed_at = excluded.executed_at,
         quantity = excluded.quantity,
         fill_price_local = excluded.fill_price_local,
         total_gbp = excluded.total_gbp,
         fees_gbp = excluded.fees_gbp,
         gbp_derived = excluded.gbp_derived,
         raw = excluded.raw`,
    )
    .run({
      ...row,
      account_id: row.account_id ?? '',
      gbp_derived: row.gbp_derived ?? 0,
      raw: row.raw !== undefined ? JSON.stringify(row.raw) : null,
    });
}

export function getAllOrders(): OrderRow[] {
  return getDb()
    .prepare('SELECT * FROM orders ORDER BY executed_at')
    .all() as OrderRow[];
}

export function getOrdersByTicker(t212Ticker: string): OrderRow[] {
  return getDb()
    .prepare('SELECT * FROM orders WHERE t212_ticker = ? ORDER BY executed_at')
    .all(t212Ticker) as OrderRow[];
}

// --- dividends ---

export function upsertDividend(
  row: Omit<DividendRow, 'raw' | 'account_id'> & { account_id?: string; raw?: unknown },
): void {
  getDb()
    .prepare(
      `INSERT INTO dividends (id, account_id, t212_ticker, paid_at, amount_gbp, raw)
       VALUES (@id, @account_id, @t212_ticker, @paid_at, @amount_gbp, @raw)
       ON CONFLICT(id) DO UPDATE SET
         account_id = excluded.account_id,
         t212_ticker = excluded.t212_ticker,
         paid_at = excluded.paid_at,
         amount_gbp = excluded.amount_gbp,
         raw = excluded.raw`,
    )
    .run({
      ...row,
      account_id: row.account_id ?? '',
      raw: row.raw !== undefined ? JSON.stringify(row.raw) : null,
    });
}

export function getAllDividends(): DividendRow[] {
  return getDb()
    .prepare('SELECT * FROM dividends ORDER BY paid_at')
    .all() as DividendRow[];
}

// --- transactions ---

export function upsertTransaction(
  row: Omit<TransactionRow, 'raw' | 'account_id'> & { account_id?: string; raw?: unknown },
): void {
  getDb()
    .prepare(
      `INSERT INTO transactions (id, account_id, type, occurred_at, amount_gbp, raw)
       VALUES (@id, @account_id, @type, @occurred_at, @amount_gbp, @raw)
       ON CONFLICT(id) DO UPDATE SET
         account_id = excluded.account_id,
         type = excluded.type,
         occurred_at = excluded.occurred_at,
         amount_gbp = excluded.amount_gbp,
         raw = excluded.raw`,
    )
    .run({
      ...row,
      account_id: row.account_id ?? '',
      raw: row.raw !== undefined ? JSON.stringify(row.raw) : null,
    });
}

export function getAllTransactions(): TransactionRow[] {
  return getDb()
    .prepare('SELECT * FROM transactions ORDER BY occurred_at')
    .all() as TransactionRow[];
}

// --- prices ---

export function upsertPrice(row: PriceRow): void {
  getDb()
    .prepare(
      `INSERT INTO prices (yahoo_symbol, date, close_local)
       VALUES (@yahoo_symbol, @date, @close_local)
       ON CONFLICT(yahoo_symbol, date) DO UPDATE SET close_local = excluded.close_local`,
    )
    .run(row);
}

export function upsertPrices(rows: PriceRow[]): void {
  const stmt = getDb().prepare(
    `INSERT INTO prices (yahoo_symbol, date, close_local)
     VALUES (@yahoo_symbol, @date, @close_local)
     ON CONFLICT(yahoo_symbol, date) DO UPDATE SET close_local = excluded.close_local`,
  );
  const tx = getDb().transaction((batch: PriceRow[]) => {
    for (const row of batch) stmt.run(row);
  });
  tx(rows);
}

export function getPrices(yahooSymbol: string, fromDate?: string): PriceRow[] {
  if (fromDate) {
    return getDb()
      .prepare('SELECT * FROM prices WHERE yahoo_symbol = ? AND date >= ? ORDER BY date')
      .all(yahooSymbol, fromDate) as PriceRow[];
  }
  return getDb()
    .prepare('SELECT * FROM prices WHERE yahoo_symbol = ? ORDER BY date')
    .all(yahooSymbol) as PriceRow[];
}

export function getLatestPriceDate(yahooSymbol: string): string | null {
  const row = getDb()
    .prepare('SELECT MAX(date) AS d FROM prices WHERE yahoo_symbol = ?')
    .get(yahooSymbol) as { d: string | null } | undefined;
  return row?.d ?? null;
}

// --- div_events ---

export function upsertDivEvent(row: DivEventRow): void {
  getDb()
    .prepare(
      `INSERT INTO div_events (yahoo_symbol, date, per_share_local)
       VALUES (@yahoo_symbol, @date, @per_share_local)
       ON CONFLICT(yahoo_symbol, date) DO UPDATE SET per_share_local = excluded.per_share_local`,
    )
    .run(row);
}

export function getDivEvents(yahooSymbol: string): DivEventRow[] {
  return getDb()
    .prepare('SELECT * FROM div_events WHERE yahoo_symbol = ? ORDER BY date')
    .all(yahooSymbol) as DivEventRow[];
}

// --- splits ---

export function upsertSplit(row: SplitRow): void {
  getDb()
    .prepare(
      `INSERT INTO splits (yahoo_symbol, date, numerator, denominator)
       VALUES (@yahoo_symbol, @date, @numerator, @denominator)
       ON CONFLICT(yahoo_symbol, date) DO UPDATE SET
         numerator = excluded.numerator,
         denominator = excluded.denominator`,
    )
    .run(row);
}

export function getSplits(yahooSymbol: string): SplitRow[] {
  return getDb()
    .prepare('SELECT * FROM splits WHERE yahoo_symbol = ? ORDER BY date')
    .all(yahooSymbol) as SplitRow[];
}

// --- fx ---

export function upsertFx(row: FxRow): void {
  getDb()
    .prepare(
      `INSERT INTO fx (date, ccy, gbp_per_unit)
       VALUES (@date, @ccy, @gbp_per_unit)
       ON CONFLICT(date, ccy) DO UPDATE SET gbp_per_unit = excluded.gbp_per_unit`,
    )
    .run(row);
}

export function upsertFxBatch(rows: FxRow[]): void {
  const stmt = getDb().prepare(
    `INSERT INTO fx (date, ccy, gbp_per_unit)
     VALUES (@date, @ccy, @gbp_per_unit)
     ON CONFLICT(date, ccy) DO UPDATE SET gbp_per_unit = excluded.gbp_per_unit`,
  );
  const tx = getDb().transaction((batch: FxRow[]) => {
    for (const row of batch) stmt.run(row);
  });
  tx(rows);
}

export function getFx(ccy: string, fromDate?: string): FxRow[] {
  if (fromDate) {
    return getDb()
      .prepare('SELECT * FROM fx WHERE ccy = ? AND date >= ? ORDER BY date')
      .all(ccy, fromDate) as FxRow[];
  }
  return getDb()
    .prepare('SELECT * FROM fx WHERE ccy = ? ORDER BY date')
    .all(ccy) as FxRow[];
}

export function getFxRate(ccy: string, date: string): number | null {
  if (ccy === 'GBP') return 1;
  const row = getDb()
    .prepare('SELECT gbp_per_unit FROM fx WHERE ccy = ? AND date <= ? ORDER BY date DESC LIMIT 1')
    .get(ccy, date) as { gbp_per_unit: number } | undefined;
  return row?.gbp_per_unit ?? null;
}

export function getLatestFxDate(ccy: string): string | null {
  const row = getDb()
    .prepare('SELECT MAX(date) AS d FROM fx WHERE ccy = ?')
    .get(ccy) as { d: string | null } | undefined;
  return row?.d ?? null;
}

export function getDistinctFxCurrencies(): string[] {
  const rows = getDb()
    .prepare('SELECT DISTINCT ccy FROM fx ORDER BY ccy')
    .all() as Array<{ ccy: string }>;
  return rows.map((r) => r.ccy);
}

// --- notes ---

export function upsertNote(orderId: string, text: string): void {
  getDb()
    .prepare(
      `INSERT INTO notes (order_id, text, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(order_id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
    )
    .run(orderId, text, new Date().toISOString());
}

export function getNote(orderId: string): NoteRow | null {
  return (
    (getDb()
      .prepare('SELECT * FROM notes WHERE order_id = ?')
      .get(orderId) as NoteRow | undefined) ?? null
  );
}

export function getAllNotes(): NoteRow[] {
  return getDb().prepare('SELECT * FROM notes').all() as NoteRow[];
}

// --- counts ---

export function countOrders(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS c FROM orders').get() as { c: number };
  return row.c;
}

export function countInstruments(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS c FROM instruments').get() as { c: number };
  return row.c;
}

export function countDividends(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS c FROM dividends').get() as { c: number };
  return row.c;
}

export function countTransactions(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS c FROM transactions').get() as { c: number };
  return row.c;
}

export function getDistinctYahooSymbols(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT yahoo_symbol FROM instruments WHERE yahoo_symbol IS NOT NULL
       UNION
       SELECT DISTINCT yahoo_symbol FROM prices`,
    )
    .all() as Array<{ yahoo_symbol: string }>;
  return rows.map((r) => r.yahoo_symbol);
}
