import {
  getSyncState,
  hasDividend,
  hasOrder,
  hasTransaction,
  replacePieInstruments,
  setSyncState,
  upsertDividend,
  upsertInstruments,
  upsertOrder,
  upsertPie,
  upsertTransaction,
} from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { getAccounts, T212ConfigError, type T212Account } from './accounts';
import {
  getAccountInfo,
  getDividends,
  getInstruments,
  getOrders,
  getPie,
  getPies,
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

type HistoryKind = keyof typeof CURSOR_KEYS;

/** Cursors are per account — resuming account B from account A's cursor would skip its history. */
function cursorKey(kind: HistoryKind, accountId: string): string {
  return `${CURSOR_KEYS[kind]}:${accountId}`;
}

/**
 * Set once a walk has reached the end of an account's history. Until then the
 * stored records are an unknown prefix, so "we already have this one" says
 * nothing about what lies further back and the walk must run to completion.
 */
function backfillKey(kind: HistoryKind, accountId: string): string {
  return `${CURSOR_KEYS[kind]}_backfilled:${accountId}`;
}

function isBackfilled(kind: HistoryKind, accountId: string): boolean {
  return getSyncState(backfillKey(kind, accountId)) === 'true';
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

interface PagedWalk<TRecord> {
  kind: HistoryKind;
  account: T212Account;
  /** Returns records already normalised to their stored shape, newest first. */
  fetchPage: (
    cursor: string | null,
  ) => Promise<{ records: TRecord[]; nextPagePath: string | null }>;
  /** True when the record is already stored, marking the boundary of a prior walk. */
  isKnown: (record: TRecord) => boolean;
  store: (record: TRecord) => void;
  onProgress: SyncProgressCallback;
  /** Force a complete walk even when the history is already backfilled. */
  full?: boolean;
}

/**
 * Walk one paged T212 history endpoint newest-first.
 *
 * Every request is throttled to 2s, so re-walking years of history to pick up a
 * handful of new records dominated sync time. Once an account's history has been
 * fully backfilled, stop at the page containing the first record already stored:
 * everything beyond it was written by an earlier walk.
 *
 * The whole page is still processed before stopping rather than breaking on the
 * record itself — it costs no extra request, and it repairs any gap left by an
 * interrupted run instead of stepping over it.
 */
export async function walkPagedHistory<TRecord>({
  kind,
  account,
  fetchPage,
  isKnown,
  store,
  onProgress,
  full = false,
}: PagedWalk<TRecord>): Promise<number> {
  const key = cursorKey(kind, account.id);
  const incremental = !full && isBackfilled(kind, account.id);
  let cursor = loadCursor(key);
  let count = 0;

  while (true) {
    onProgress({ phase: kind, current: count });
    const { records, nextPagePath } = await fetchPage(cursor);

    let reachedKnown = false;
    for (const record of records) {
      if (incremental && isKnown(record)) reachedKnown = true;
      store(record);
      count += 1;
    }

    if (reachedKnown || !nextPagePath) {
      persistCursor(key, null);
      // A walk that stopped early only proves the tail is present because a
      // previous walk reached the end; either way the history is complete.
      setSyncState(backfillKey(kind, account.id), 'true');
      break;
    }
    persistCursor(key, nextPagePath);
    cursor = nextPagePath;
  }

  onProgress({ phase: kind, current: count });
  return count;
}

async function syncOrders(
  account: T212Account,
  accountCurrency: string,
  fxLookup: FxLookup | undefined,
  onProgress: SyncProgressCallback,
  full?: boolean,
): Promise<number> {
  return walkPagedHistory({
    kind: 'orders',
    account,
    full,
    onProgress,
    fetchPage: async (cursor) => {
      const { data } = await getOrders(account, cursor);
      return {
        records: normalizeOrders(data.items, accountCurrency, fxLookup),
        nextPagePath: data.nextPagePath,
      };
    },
    isKnown: (order) => hasOrder(order.id),
    store: (order) => upsertOrder({ ...order, account_id: account.id }),
  });
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
  full?: boolean,
): Promise<number> {
  return walkPagedHistory({
    kind: 'dividends',
    account,
    full,
    onProgress,
    fetchPage: async (cursor) => {
      const { data } = await getDividends(account, cursor);
      return { records: data.items, nextPagePath: data.nextPagePath };
    },
    isKnown: (item) => hasDividend(item.reference),
    store: (item) => upsertDividendFromApi(item, account.id),
  });
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
  full?: boolean,
): Promise<number> {
  return walkPagedHistory({
    kind: 'transactions',
    account,
    full,
    onProgress,
    fetchPage: async (cursor) => {
      const { data } = await getTransactions(account, cursor);
      return { records: data.items, nextPagePath: data.nextPagePath };
    },
    isKnown: (item) => hasTransaction(item.reference),
    store: (item) => upsertTransactionFromApi(item, account.id, accountCurrency, fxLookup),
  });
}

/**
 * Pies are a live snapshot — T212 exposes no pie history and no pie id on
 * orders, so this is the only record of which instruments a pie holds and at
 * what target weights. Everything historical is reconstructed from orders in
 * `lib/analysis/pies.ts` against the creation date stored here.
 */
async function syncPies(
  account: T212Account,
  onProgress: SyncProgressCallback,
): Promise<number> {
  onProgress({ phase: 'pies', current: 0 });
  const { data: list } = await getPies(account);
  const snapshotAt = new Date().toISOString();

  for (const [i, summary] of list.entries()) {
    onProgress({ phase: 'pies', current: i, total: list.length });
    const { data: detail, raw } = await getPie(account, summary.id);
    const settings = detail.settings;

    upsertPie({
      id: summary.id,
      account_id: account.id,
      name: settings.name ?? null,
      icon: settings.icon ?? null,
      created_at: settings.creationDate
        ? new Date(settings.creationDate * 1000).toISOString().slice(0, 10)
        : null,
      end_date: settings.endDate ? settings.endDate.slice(0, 10) : null,
      goal: settings.goal ?? null,
      initial_investment: settings.initialInvestment ?? null,
      dividend_cash_action: settings.dividendCashAction ?? null,
      cash: summary.cash ?? null,
      invested: summary.result?.priceAvgInvestedValue ?? null,
      value: summary.result?.priceAvgValue ?? null,
      result: summary.result?.priceAvgResult ?? null,
      result_coef: summary.result?.priceAvgResultCoef ?? null,
      progress: summary.progress ?? null,
      dividends_gained: summary.dividendDetails?.gained ?? null,
      dividends_reinvested: summary.dividendDetails?.reinvested ?? null,
      dividends_in_cash: summary.dividendDetails?.inCash ?? null,
      snapshot_at: snapshotAt,
      raw,
    });

    replacePieInstruments(
      summary.id,
      detail.instruments.map((inst) => ({
        pie_id: summary.id,
        t212_ticker: inst.ticker,
        expected_share: inst.expectedShare ?? null,
        current_share: inst.currentShare ?? null,
        owned_quantity: inst.ownedQuantity ?? null,
        invested: inst.result?.priceAvgInvestedValue ?? null,
        value: inst.result?.priceAvgValue ?? null,
        result: inst.result?.priceAvgResult ?? null,
        result_coef: inst.result?.priceAvgResultCoef ?? null,
      })),
    );
  }

  onProgress({ phase: 'pies', current: list.length, total: list.length });
  return list.length;
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
  pies: number;
}

export interface T212SyncSummary {
  accounts: T212AccountSyncSummary[];
  /** Totals across every account — the dashboard treats them as one portfolio. */
  instruments: number;
  orders: number;
  dividends: number;
  transactions: number;
  pies: number;
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

export interface T212SyncOptions {
  /**
   * Re-walk every account's full history instead of stopping at the first
   * already-stored record. The escape hatch for the incremental walk's one
   * assumption: that T212 only ever prepends to history, never back-inserts
   * older records.
   */
  full?: boolean;
}

export async function runT212Sync(
  onProgress: SyncProgressCallback = () => undefined,
  fxLookup?: FxLookup,
  options: T212SyncOptions = {},
): Promise<T212SyncSummary> {
  migrate();
  const { full } = options;

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
    const orders = await syncOrders(account, currency, fxLookup, report, full);
    const dividends = await syncDividends(account, report, full);
    const transactions = await syncTransactions(account, currency, fxLookup, report, full);
    const pies = await syncPies(account, report);

    summaries.push({
      accountId: account.id,
      t212AccountId,
      currency,
      instruments,
      orders,
      dividends,
      transactions,
      pies,
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
    pies: total((s) => s.pies),
    accountCurrency,
  };
}
