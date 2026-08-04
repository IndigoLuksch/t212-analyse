import { getDb } from "./index";

/**
 * `account_id` is the config slug of the Trading 212 account a row came from
 * ("isa", "invest"). It is provenance only — every read path in the app treats
 * the accounts as one combined portfolio, so nothing filters on it.
 *
 * Row ids stay single-column primary keys: T212 order ids are a global integer
 * sequence and dividend/transaction references are UUIDs, so two accounts
 * cannot mint the same id.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS instruments (
  t212_ticker TEXT PRIMARY KEY,
  isin TEXT,
  name TEXT,
  currency TEXT,
  yahoo_symbol TEXT,
  yahoo_override TEXT,
  color_slot INTEGER,
  raw JSON
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL DEFAULT '',
  t212_ticker TEXT,
  side TEXT CHECK(side IN ('BUY','SELL')),
  executed_at TEXT,
  quantity REAL,
  fill_price_local REAL,
  total_gbp REAL,
  fees_gbp REAL,
  gbp_derived INTEGER DEFAULT 0,
  raw JSON
);

CREATE TABLE IF NOT EXISTS dividends (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL DEFAULT '',
  t212_ticker TEXT,
  paid_at TEXT,
  amount_gbp REAL,
  raw JSON
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL DEFAULT '',
  type TEXT,
  occurred_at TEXT,
  amount_gbp REAL,
  raw JSON
);

CREATE TABLE IF NOT EXISTS prices (
  yahoo_symbol TEXT,
  date TEXT,
  close_local REAL,
  PRIMARY KEY(yahoo_symbol, date)
);

CREATE TABLE IF NOT EXISTS div_events (
  yahoo_symbol TEXT,
  date TEXT,
  per_share_local REAL,
  PRIMARY KEY(yahoo_symbol, date)
);

CREATE TABLE IF NOT EXISTS splits (
  yahoo_symbol TEXT,
  date TEXT,
  numerator REAL,
  denominator REAL,
  PRIMARY KEY(yahoo_symbol, date)
);

CREATE TABLE IF NOT EXISTS fx (
  date TEXT,
  ccy TEXT,
  gbp_per_unit REAL,
  PRIMARY KEY(date, ccy)
);

CREATE TABLE IF NOT EXISTS notes (
  order_id TEXT PRIMARY KEY,
  text TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS theses (
  id TEXT PRIMARY KEY,
  t212_ticker TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','bought','abandoned')),
  target_weight REAL,
  thesis TEXT NOT NULL,
  falsifier TEXT NOT NULL,
  review_at TEXT NOT NULL,
  entry_context JSON,
  linked_order_id TEXT,
  closed_at TEXT,
  outcome_note TEXT
);

CREATE TABLE IF NOT EXISTS thesis_reviews (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK(verdict IN ('intact','broken','unclear')),
  note TEXT
);

CREATE TABLE IF NOT EXISTS pies (
  id INTEGER PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT,
  icon TEXT,
  created_at TEXT,
  end_date TEXT,
  goal REAL,
  initial_investment REAL,
  dividend_cash_action TEXT,
  cash REAL,
  invested REAL,
  value REAL,
  result REAL,
  result_coef REAL,
  progress REAL,
  dividends_gained REAL,
  dividends_reinvested REAL,
  dividends_in_cash REAL,
  snapshot_at TEXT,
  raw JSON
);

CREATE TABLE IF NOT EXISTS pie_instruments (
  pie_id INTEGER NOT NULL,
  t212_ticker TEXT NOT NULL,
  expected_share REAL,
  current_share REAL,
  owned_quantity REAL,
  invested REAL,
  value REAL,
  result REAL,
  result_coef REAL,
  PRIMARY KEY (pie_id, t212_ticker)
);
`;

const SCHEMA_VERSION = 3;

/** Cursor keys from before cursors were namespaced per account. */
const LEGACY_CURSOR_KEYS = [
  "t212_orders_cursor",
  "t212_dividends_cursor",
  "t212_transactions_cursor",
];

function hasColumn(table: string, column: string): boolean {
  const columns = getDb().pragma(`table_info(${table})`) as Array<{ name: string }>;
  return columns.some((c) => c.name === column);
}

/**
 * Retro-fit `account_id` onto a database created before multi-account support.
 *
 * Existing rows keep an empty `account_id`; the next sync re-fetches full
 * history (cursors are cleared on completion, so every sync already does) and
 * upserts each row with its real account, relabelling them in place.
 */
function addAccountIdColumns(): void {
  const db = getDb();
  for (const table of ["orders", "dividends", "transactions"]) {
    if (!hasColumn(table, "account_id")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN account_id TEXT NOT NULL DEFAULT ''`);
    }
  }

  const stmt = db.prepare("DELETE FROM sync_state WHERE key = ?");
  for (const key of LEGACY_CURSOR_KEYS) stmt.run(key);
}

/**
 * Under the pre-incremental sync every completed walk cleared its cursor to an
 * empty string, so an empty cursor is evidence that a walk once reached the end
 * of that account's history. Promote that to the explicit backfilled flag the
 * incremental walk needs, sparing one more full re-walk of every endpoint.
 */
function markCompletedHistoryBackfilled(): void {
  const db = getDb();
  const rows = db
    .prepare("SELECT key, value FROM sync_state WHERE key LIKE 't212\\_%\\_cursor:%' ESCAPE '\\'")
    .all() as Array<{ key: string; value: string }>;

  const stmt = db.prepare(
    'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  for (const row of rows) {
    // A non-empty cursor is an interrupted walk — leave it to run to completion.
    if (row.value !== '') continue;
    const [cursorKey, accountId] = row.key.split(':');
    stmt.run(`${cursorKey}_backfilled:${accountId}`, 'true');
  }
}

export function migrate(): void {
  const db = getDb();
  db.exec(SCHEMA);

  const version = db.pragma("user_version", { simple: true }) as number;
  if (version >= SCHEMA_VERSION) return;

  if (version < 1) addAccountIdColumns();
  // Gated on SCHEMA_VERSION rather than a literal: this step is idempotent, and
  // tying it to the constant means a version bump can never step over it.
  if (version < SCHEMA_VERSION) markCompletedHistoryBackfilled();
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}
