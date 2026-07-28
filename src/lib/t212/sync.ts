import {
  getSyncState,
  setSyncState,
  upsertDividend,
  upsertInstruments,
  upsertOrder,
  upsertTransaction,
} from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { getAccounts, T212ConfigError, type T212Account } from './accounts';
import {
  getAccountInfo,
  getDividends,
  getInstruments,
  getOrders,
  getTransactions,
  type T212DividendItem,
  type T212TransactionItem,
} from './client';
import { normalizeOrders, type FxLookup } from './normalize';

export interface SyncProgress {
  phase: string;
  current: number;
  total?: number;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

const CURSOR_KEYS = {
  orders: 't212_orders_cursor',
  dividends: 't212_dividends_cursor',
  transactions: 't212_transactions_cursor',
} as const;

/** Cursors are per account — resuming account B from account A's cursor would skip its history. */
function cursorKey(kind: keyof typeof CURSOR_KEYS, accountId: string): string {
  return `${CURSOR_KEYS[kind]}:${accountId}`;
}

/** Remembers which T212 account a config slug resolved to, so a swapped key pair is caught. */
function identityKey(accountId: string): string {
  return `t212_account_identity:${accountId}`;
}

function persistCursor(key: string, cursor: string | null): void {
  if (cursor) setSyncState(key, cursor);
  else setSyncState(key, '');
}

function loadCursor(key: string): string | null {
  const value = getSyncState(key);
  return value ? value : null;
}

/** Phase labels carry the account so the sync pill shows which one is in flight. */
function phaseLabel(phase: string, accountId: string, accountCount: number): string {
  return accountCount > 1 ? `${phase} · ${accountId}` : phase;
}

async function syncInstruments(
  account: T212Account,
  onProgress: SyncProgressCallback,
): Promise<number> {
  onProgress({ phase: 'instruments', current: 0 });
  const { data } = await getInstruments(account);
  upsertInstruments(
    data.map((inst) => ({
      t212_ticker: inst.ticker,
      isin: inst.isin ?? null,
      name: inst.name ?? null,
      // metadata endpoint → currencyCode; order-nested instrument → currency.
      // Note GBX/GBp here flags a pence-quoted listing.
      currency: inst.currencyCode ?? inst.currency ?? null,
      yahoo_symbol: null,
      yahoo_override: null,
      color_slot: null,
      raw: inst,
    })),
  );
  onProgress({ phase: 'instruments', current: data.length, total: data.length });
  return data.length;
}

async function syncOrders(
  account: T212Account,
  accountCurrency: string,
  fxLookup: FxLookup | undefined,
  onProgress: SyncProgressCallback,
): Promise<number> {
  const key = cursorKey('orders', account.id);
  let cursor = loadCursor(key);
  let count = 0;

  while (true) {
    onProgress({ phase: 'orders', current: count });
    const { data } = await getOrders(account, cursor);
    const normalized = normalizeOrders(data.items, accountCurrency, fxLookup);
    for (const order of normalized) {
      upsertOrder({ ...order, account_id: account.id });
      count += 1;
    }

    if (!data.nextPagePath) {
      persistCursor(key, null);
      break;
    }
    persistCursor(key, data.nextPagePath);
    cursor = data.nextPagePath;
  }

  onProgress({ phase: 'orders', current: count });
  return count;
}

function upsertDividendFromApi(item: T212DividendItem, accountId: string): void {
  upsertDividend({
    id: item.reference,
    account_id: accountId,
    t212_ticker: item.ticker,
    paid_at: new Date(item.paidOn).toISOString(),
    amount_gbp: item.amount,
    raw: item,
  });
}

async function syncDividends(
  account: T212Account,
  onProgress: SyncProgressCallback,
): Promise<number> {
  const key = cursorKey('dividends', account.id);
  let cursor = loadCursor(key);
  let count = 0;

  while (true) {
    onProgress({ phase: 'dividends', current: count });
    const { data } = await getDividends(account, cursor);
    for (const item of data.items) {
      upsertDividendFromApi(item, account.id);
      count += 1;
    }

    if (!data.nextPagePath) {
      persistCursor(key, null);
      break;
    }
    persistCursor(key, data.nextPagePath);
    cursor = data.nextPagePath;
  }

  onProgress({ phase: 'dividends', current: count });
  return count;
}

function upsertTransactionFromApi(
  item: T212TransactionItem,
  accountId: string,
  accountCurrency: string,
  fxLookup?: FxLookup,
): void {
  const date = new Date(item.dateTime).toISOString().slice(0, 10);
  let amountGbp = item.amount;
  if (item.currency !== accountCurrency) {
    const fx = fxLookup?.(item.currency, date);
    amountGbp = fx !== null && fx !== undefined ? item.amount * fx : item.amount;
  }

  upsertTransaction({
    id: item.reference,
    account_id: accountId,
    type: item.type,
    occurred_at: new Date(item.dateTime).toISOString(),
    amount_gbp: amountGbp,
    raw: item,
  });
}

async function syncTransactions(
  account: T212Account,
  accountCurrency: string,
  fxLookup: FxLookup | undefined,
  onProgress: SyncProgressCallback,
): Promise<number> {
  const key = cursorKey('transactions', account.id);
  let cursor = loadCursor(key);
  let count = 0;

  while (true) {
    onProgress({ phase: 'transactions', current: count });
    const { data } = await getTransactions(account, cursor);
    for (const item of data.items) {
      upsertTransactionFromApi(item, account.id, accountCurrency, fxLookup);
      count += 1;
    }

    if (!data.nextPagePath) {
      persistCursor(key, null);
      break;
    }
    persistCursor(key, data.nextPagePath);
    cursor = data.nextPagePath;
  }

  onProgress({ phase: 'transactions', current: count });
  return count;
}

export interface T212AccountSyncSummary {
  /** Config slug, as stored in `account_id`. */
  accountId: string;
  /** Numeric id reported by T212, used to detect swapped credentials. */
  t212AccountId: number;
  currency: string;
  instruments: number;
  orders: number;
  dividends: number;
  transactions: number;
}

export interface T212SyncSummary {
  accounts: T212AccountSyncSummary[];
  /** Totals across every account — the dashboard treats them as one portfolio. */
  instruments: number;
  orders: number;
  dividends: number;
  transactions: number;
  accountCurrency: string;
}

interface ResolvedAccount {
  account: T212Account;
  t212AccountId: number;
  currency: string;
}

/**
 * Identify every configured account before writing anything, so credential
 * mistakes fail the whole sync instead of half-labelling the database.
 *
 * Two failure modes matter and both corrupt data silently if unchecked:
 * the same key pair pasted under two slugs (every row double-counted), and a
 * slug whose key pair now points at a different T212 account (rows from one
 * account relabelled as another).
 */
async function resolveAccounts(accounts: T212Account[]): Promise<ResolvedAccount[]> {
  const resolved: ResolvedAccount[] = [];
  const seenT212Ids = new Map<number, string>();

  for (const account of accounts) {
    const { data } = await getAccountInfo(account);

    const duplicate = seenT212Ids.get(data.id);
    if (duplicate !== undefined) {
      throw new T212ConfigError(
        `Accounts "${duplicate}" and "${account.id}" use credentials for the same Trading 212 account ` +
          `(id ${data.id}). Check ${account.envPrefix}_API_KEY.`,
      );
    }
    seenT212Ids.set(data.id, account.id);

    const known = getSyncState(identityKey(account.id));
    if (known && known !== String(data.id)) {
      throw new T212ConfigError(
        `Account "${account.id}" previously synced Trading 212 account ${known} but its credentials now ` +
          `point at ${data.id}. Rename the account in T212_ACCOUNTS, or delete data/app.db to start over.`,
      );
    }

    resolved.push({ account, t212AccountId: data.id, currency: data.currencyCode });
  }

  // Every monetary column is stored in the account's base currency under a
  // `_gbp` name. Mixing bases would silently blend currencies in one total.
  const currencies = new Set(resolved.map((r) => r.currency));
  if (currencies.size > 1) {
    const detail = resolved.map((r) => `${r.account.id}=${r.currency}`).join(', ');
    throw new T212ConfigError(
      `Accounts must share one base currency to be combined, but found ${detail}.`,
    );
  }

  return resolved;
}

export async function runT212Sync(
  onProgress: SyncProgressCallback = () => undefined,
  fxLookup?: FxLookup,
): Promise<T212SyncSummary> {
  migrate();

  const accounts = getAccounts();
  const resolved = await resolveAccounts(accounts);
  const accountCurrency = resolved[0]!.currency;

  const summaries: T212AccountSyncSummary[] = [];

  for (const { account, t212AccountId, currency } of resolved) {
    const report: SyncProgressCallback = (progress) =>
      onProgress({ ...progress, phase: phaseLabel(progress.phase, account.id, resolved.length) });

    // Pin the identity before writing rows, so an interrupted sync still leaves
    // the slug bound to the account whose data landed under it.
    setSyncState(identityKey(account.id), String(t212AccountId));

    const instruments = await syncInstruments(account, report);
    const orders = await syncOrders(account, currency, fxLookup, report);
    const dividends = await syncDividends(account, report);
    const transactions = await syncTransactions(account, currency, fxLookup, report);

    summaries.push({
      accountId: account.id,
      t212AccountId,
      currency,
      instruments,
      orders,
      dividends,
      transactions,
    });
  }

  const total = (pick: (s: T212AccountSyncSummary) => number): number =>
    summaries.reduce((sum, s) => sum + pick(s), 0);

  return {
    accounts: summaries,
    instruments: total((s) => s.instruments),
    orders: total((s) => s.orders),
    dividends: total((s) => s.dividends),
    transactions: total((s) => s.transactions),
    accountCurrency,
  };
}
