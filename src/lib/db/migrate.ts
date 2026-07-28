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
`;

const SCHEMA_VERSION = 1;

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

export function migrate(): void {
  const db = getDb();
  db.exec(SCHEMA);

  const version = db.pragma("user_version", { simple: true }) as number;
  if (version >= SCHEMA_VERSION) return;

  addAccountIdColumns();
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}
