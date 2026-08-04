import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = new Map<string, string>();

vi.mock('@/lib/db', () => ({
  getSyncState: (key: string) => state.get(key) ?? null,
  setSyncState: (key: string, value: string) => {
    state.set(key, value);
  },
  hasOrder: () => false,
  hasDividend: () => false,
  hasTransaction: () => false,
  upsertOrder: () => undefined,
  upsertDividend: () => undefined,
  upsertTransaction: () => undefined,
  upsertInstruments: () => undefined,
}));

vi.mock('@/lib/db/migrate', () => ({ migrate: () => undefined }));

const { walkPagedHistory } = await import('../sync');

const account = {
  id: 'isa',
  envPrefix: 'T212_ISA',
  apiKey: 'k',
  apiSecret: 's',
};

/** Pages of ids, newest first, 3 per page. */
function pager(ids: number[][]) {
  const calls: (string | null)[] = [];
  const fetchPage = async (cursor: string | null) => {
    calls.push(cursor);
    const index = cursor === null ? 0 : Number(cursor);
    return {
      records: (ids[index] ?? []).map((id) => ({ id })),
      nextPagePath: index + 1 < ids.length ? String(index + 1) : null,
    };
  };
  return { fetchPage, calls };
}

describe('walkPagedHistory', () => {
  beforeEach(() => state.clear());

  it('walks every page when the history has never been backfilled', async () => {
    const { fetchPage, calls } = pager([
      [9, 8, 7],
      [6, 5, 4],
      [3, 2, 1],
    ]);
    const stored: number[] = [];

    const count = await walkPagedHistory({
      kind: 'orders',
      account,
      fetchPage,
      // Everything is "already known", but an un-backfilled history must still
      // run to the end — the stored rows are an unknown prefix.
      isKnown: () => true,
      store: (r: { id: number }) => stored.push(r.id),
      onProgress: () => undefined,
    });

    expect(calls).toHaveLength(3);
    expect(count).toBe(9);
    expect(stored).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(state.get('t212_orders_cursor_backfilled:isa')).toBe('true');
  });

  it('stops at the page holding the first known record once backfilled', async () => {
    state.set('t212_orders_cursor_backfilled:isa', 'true');
    const { fetchPage, calls } = pager([
      [9, 8, 7],
      [6, 5, 4],
      [3, 2, 1],
    ]);
    const stored: number[] = [];

    // Ids 1-5 are already stored; 6 is the boundary, on page 2.
    const count = await walkPagedHistory({
      kind: 'orders',
      account,
      fetchPage,
      isKnown: (r: { id: number }) => r.id <= 6,
      store: (r: { id: number }) => stored.push(r.id),
      onProgress: () => undefined,
    });

    expect(calls).toEqual([null, '1']);
    // The whole boundary page is still written, repairing any gap left behind.
    expect(stored).toEqual([9, 8, 7, 6, 5, 4]);
    expect(count).toBe(6);
  });

  it('does not stop early when the first page is all new', async () => {
    state.set('t212_orders_cursor_backfilled:isa', 'true');
    const { fetchPage, calls } = pager([
      [9, 8, 7],
      [6, 5, 4],
      [3, 2, 1],
    ]);

    await walkPagedHistory({
      kind: 'orders',
      account,
      fetchPage,
      isKnown: (r: { id: number }) => r.id <= 3,
      store: () => undefined,
      onProgress: () => undefined,
    });

    expect(calls).toEqual([null, '1', '2']);
  });

  it('re-walks everything when full is set', async () => {
    state.set('t212_orders_cursor_backfilled:isa', 'true');
    const { fetchPage, calls } = pager([
      [9, 8, 7],
      [6, 5, 4],
      [3, 2, 1],
    ]);

    await walkPagedHistory({
      kind: 'orders',
      account,
      fetchPage,
      isKnown: () => true,
      store: () => undefined,
      onProgress: () => undefined,
      full: true,
    });

    expect(calls).toHaveLength(3);
  });

  it('resumes from a stored cursor left by an interrupted walk', async () => {
    state.set('t212_orders_cursor:isa', '2');
    const { fetchPage, calls } = pager([
      [9, 8, 7],
      [6, 5, 4],
      [3, 2, 1],
    ]);
    const stored: number[] = [];

    await walkPagedHistory({
      kind: 'orders',
      account,
      fetchPage,
      isKnown: () => false,
      store: (r: { id: number }) => stored.push(r.id),
      onProgress: () => undefined,
    });

    expect(calls).toEqual(['2']);
    expect(stored).toEqual([3, 2, 1]);
    // Reaching the end clears the cursor so the next sync starts fresh.
    expect(state.get('t212_orders_cursor:isa')).toBe('');
  });
});
