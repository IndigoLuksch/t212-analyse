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
