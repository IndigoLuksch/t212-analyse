import { z } from 'zod';
import { MIN_REQUEST_SPACING_MS, T212_BASE_URL } from '@/lib/config';
import type { T212Account } from './accounts';

export { T212ConfigError, type T212Account } from './accounts';

const InstrumentSchema = z
  .object({
    ticker: z.string(),
    isin: z.string().optional(),
    name: z.string().optional(),
    // The metadata endpoint returns `currencyCode`; the instrument nested inside
    // an order returns `currency`. Both appear, so accept either.
    currency: z.string().optional(),
    currencyCode: z.string().optional(),
    // Current exchange symbol — resolves renames (FB→META, IPOE→SOFI, LSE→LSEG)
    // that the T212 ticker still reflects.
    shortName: z.string().optional(),
  })
  .passthrough();

const InstrumentsResponseSchema = z.array(InstrumentSchema);

const FillSchema = z
  .object({
    id: z.number(),
    filledAt: z.string(),
    price: z.number(),
    quantity: z.number(),
    walletImpact: z
      .object({
        currency: z.string().optional(),
        fxRate: z.number().optional(),
        netValue: z.number().optional(),
        taxes: z
          .array(
            z
              .object({
                name: z.string().optional(),
                quantity: z.number().optional(),
                currency: z.string().optional(),
              })
              .passthrough(),
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const OrderItemSchema = z
  .object({
    fill: FillSchema.optional(),
    order: z
      .object({
        id: z.number(),
        side: z.enum(['BUY', 'SELL']),
        status: z.string(),
        ticker: z.string().optional(),
        currency: z.string().optional(),
        instrument: InstrumentSchema.optional(),
      })
      .passthrough(),
  })
  .passthrough();

const PaginatedOrdersSchema = z
  .object({
    items: z.array(OrderItemSchema),
    nextPagePath: z.string().nullable(),
  })
  .passthrough();

const DividendItemSchema = z
  .object({
    reference: z.string(),
    ticker: z.string(),
    paidOn: z.string(),
    amount: z.number(),
    currency: z.string().optional(),
    instrument: InstrumentSchema.optional(),
  })
  .passthrough();

const PaginatedDividendsSchema = z
  .object({
    items: z.array(DividendItemSchema),
    nextPagePath: z.string().nullable(),
  })
  .passthrough();

const TransactionItemSchema = z
  .object({
    reference: z.string(),
    type: z.string(),
    dateTime: z.string(),
    amount: z.number(),
    currency: z.string(),
  })
  .passthrough();

const PaginatedTransactionsSchema = z
  .object({
    items: z.array(TransactionItemSchema),
    nextPagePath: z.string().nullable(),
  })
  .passthrough();

const PortfolioPositionSchema = z
  .object({
    ticker: z.string(),
    quantity: z.number(),
    averagePrice: z.number().optional(),
    currentPrice: z.number().optional(),
    ppl: z.number().optional(),
    fxPpl: z.number().optional(),
    initialFillDate: z.string().optional(),
  })
  .passthrough();

const PortfolioResponseSchema = z.array(PortfolioPositionSchema);

const AccountInfoSchema = z
  .object({
    id: z.number(),
    currencyCode: z.string(),
  })
  .passthrough();

/** `priceAvgInvestedValue` is the average-cost basis of what is held now, not net cash in. */
const PieResultSchema = z
  .object({
    priceAvgInvestedValue: z.number().optional(),
    priceAvgValue: z.number().optional(),
    priceAvgResult: z.number().optional(),
    priceAvgResultCoef: z.number().optional(),
  })
  .passthrough();

const PieListItemSchema = z
  .object({
    id: z.number(),
    cash: z.number().optional(),
    dividendDetails: z
      .object({
        gained: z.number().optional(),
        reinvested: z.number().optional(),
        inCash: z.number().optional(),
      })
      .passthrough()
      .optional(),
    result: PieResultSchema.optional(),
    progress: z.number().nullable().optional(),
    status: z.string().nullable().optional(),
  })
  .passthrough();

const PiesResponseSchema = z.array(PieListItemSchema);

const PieDetailSchema = z
  .object({
    instruments: z.array(
      z
        .object({
          ticker: z.string(),
          result: PieResultSchema.optional(),
          expectedShare: z.number().optional(),
          currentShare: z.number().optional(),
          ownedQuantity: z.number().optional(),
          issues: z.array(z.unknown()).optional(),
        })
        .passthrough(),
    ),
    settings: z
      .object({
        id: z.number(),
        name: z.string().nullable().optional(),
        icon: z.string().nullable().optional(),
        // Epoch seconds, fractional.
        creationDate: z.number().nullable().optional(),
        endDate: z.string().nullable().optional(),
        goal: z.number().nullable().optional(),
        initialInvestment: z.number().nullable().optional(),
        dividendCashAction: z.string().nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type T212Instrument = z.infer<typeof InstrumentSchema>;
export type T212OrderItem = z.infer<typeof OrderItemSchema>;
export type T212DividendItem = z.infer<typeof DividendItemSchema>;
export type T212TransactionItem = z.infer<typeof TransactionItemSchema>;
export type T212PortfolioPosition = z.infer<typeof PortfolioPositionSchema>;
export type T212AccountInfo = z.infer<typeof AccountInfoSchema>;
export type T212PieListItem = z.infer<typeof PieListItemSchema>;
export type T212PieDetail = z.infer<typeof PieDetailSchema>;

export interface T212ParsedResponse<T> {
  data: T;
  raw: unknown;
}

function authHeader(account: T212Account): string {
  const encoded = Buffer.from(`${account.apiKey}:${account.apiSecret}`).toString('base64');
  return `Basic ${encoded}`;
}

let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, MIN_REQUEST_SPACING_MS - (now - lastRequestAt));
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function fetchWithRetry(account: T212Account, path: string, attempt = 0): Promise<Response> {
  await throttle();
  const url = path.startsWith('http') ? path : `${T212_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader(account),
      Accept: 'application/json',
    },
  });

  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');
    const waitMs = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : MIN_REQUEST_SPACING_MS * (attempt + 2);
    await sleep(Number.isFinite(waitMs) ? waitMs : MIN_REQUEST_SPACING_MS * (attempt + 2));
    if (attempt < 5) return fetchWithRetry(account, path, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`T212 API ${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
  }

  return res;
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn);
  queue = result.catch(() => undefined);
  return result;
}

/**
 * The queue and throttle stay GLOBAL rather than per-account. T212's limits are
 * strict and partly per-endpoint, so two accounts hammering the same endpoint
 * concurrently would trip 429s that a single serialised stream never sees.
 */
async function getJson<T>(
  account: T212Account,
  path: string,
  schema: z.ZodType<T>,
): Promise<T212ParsedResponse<T>> {
  return enqueue(async () => {
    const res = await fetchWithRetry(account, path);
    const raw: unknown = await res.json();
    const data = schema.parse(raw);
    return { data, raw };
  });
}

export async function getAccountInfo(
  account: T212Account,
): Promise<T212ParsedResponse<T212AccountInfo>> {
  return getJson(account, '/api/v0/equity/account/info', AccountInfoSchema);
}

export async function getPortfolio(
  account: T212Account,
): Promise<T212ParsedResponse<T212PortfolioPosition[]>> {
  return getJson(account, '/api/v0/equity/portfolio', PortfolioResponseSchema);
}

export async function getPies(
  account: T212Account,
): Promise<T212ParsedResponse<T212PieListItem[]>> {
  return getJson(account, '/api/v0/equity/pies', PiesResponseSchema);
}

export async function getPie(
  account: T212Account,
  pieId: number,
): Promise<T212ParsedResponse<T212PieDetail>> {
  return getJson(account, `/api/v0/equity/pies/${pieId}`, PieDetailSchema);
}

export async function getInstruments(
  account: T212Account,
): Promise<T212ParsedResponse<T212Instrument[]>> {
  return getJson(account, '/api/v0/equity/metadata/instruments', InstrumentsResponseSchema);
}

/**
 * `nextPagePath` is not consistent across T212 endpoints: orders return a full
 * path (`/api/v0/equity/history/orders?cursor=...`) while transactions return a
 * BARE query string (`limit=50&cursor=...`). Naively appending the latter to the
 * base URL yields `https://live.trading212.comlimit=50&...`.
 */
function resolvePagePath(
  endpoint: string,
  cursor: string | null | undefined,
  limit: number,
): string {
  if (!cursor) return `${endpoint}?limit=${limit}`;
  if (cursor.startsWith("http") || cursor.startsWith("/")) return cursor;
  if (cursor.startsWith("?")) return `${endpoint}${cursor}`;
  return `${endpoint}?${cursor}`;
}

export async function getOrders(
  account: T212Account,
  cursorPath?: string | null,
  limit = 50,
): Promise<T212ParsedResponse<z.infer<typeof PaginatedOrdersSchema>>> {
  return getJson(account, resolvePagePath("/api/v0/equity/history/orders", cursorPath, limit), PaginatedOrdersSchema);
}

export async function getDividends(
  account: T212Account,
  cursorPath?: string | null,
  limit = 50,
): Promise<T212ParsedResponse<z.infer<typeof PaginatedDividendsSchema>>> {
  return getJson(account, resolvePagePath("/api/v0/equity/history/dividends", cursorPath, limit), PaginatedDividendsSchema);
}

export async function getTransactions(
  account: T212Account,
  cursorPath?: string | null,
  limit = 50,
): Promise<T212ParsedResponse<z.infer<typeof PaginatedTransactionsSchema>>> {
  return getJson(account, resolvePagePath("/api/v0/equity/history/transactions", cursorPath, limit), PaginatedTransactionsSchema);
}
