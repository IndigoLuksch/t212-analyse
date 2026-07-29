import { EXIT_MERGE_GAP_DAYS, FLIP_MERGE_GAP_DAYS } from '@/lib/config';
import type { DividendCash, Episode, ExitEvent, Order, Split } from './types';
import { adjustOrder } from './splits';
import { applyDust, daysBetween, sortOrdersByExecution, toUtcDate } from './utils';

const MS_PER_DAY = 86_400_000;

interface ShareEvent {
  date: string;
  sharesDelta: number;
  order: Order;
  adjQty: number;
  adjPrice: number;
}

function buildShareEvents(orders: Order[], splits: Split[]): ShareEvent[] {
  return sortOrdersByExecution(orders).map((o) => {
    const { adjQty, adjPrice } = adjustOrder(o, splits);
    return {
      date: toUtcDate(o.executedAt),
      sharesDelta: o.side === 'BUY' ? adjQty : -adjQty,
      order: o,
      adjQty,
      adjPrice,
    };
  });
}

function mergeExitSells(sells: ShareEvent[]): ExitEvent[] {
  if (sells.length === 0) return [];

  const events: ExitEvent[] = [];
  let current: ShareEvent[] = [sells[0]];

  for (let i = 1; i < sells.length; i++) {
    const prev = current[current.length - 1];
    if (daysBetween(prev.date, sells[i].date) < EXIT_MERGE_GAP_DAYS) {
      current.push(sells[i]);
    } else {
      events.push(buildExitEvent(current));
      current = [sells[i]];
    }
  }
  events.push(buildExitEvent(current));
  return events;
}

function buildExitEvent(sells: ShareEvent[]): ExitEvent {
  let totalShares = 0;
  let totalProceeds = 0;
  let weightedPrice = 0;
  let weightedDate = 0;
  const orderIds: string[] = [];

  for (const s of sells) {
    const proceeds = s.order.totalGbp - s.order.feesGbp;
    totalShares += s.adjQty;
    totalProceeds += proceeds;
    weightedPrice += s.adjPrice * s.adjQty;
    weightedDate += Date.parse(`${s.date}T00:00:00Z`) * s.adjQty;
    orderIds.push(s.order.id);
  }

  const avgDate = new Date(weightedDate / totalShares).toISOString().slice(0, 10);

  return {
    date: avgDate,
    shares: totalShares,
    proceedsGbp: totalProceeds,
    avgPriceLocal: weightedPrice / totalShares,
    orderIds,
  };
}

/** An episode still being accumulated by the walk. */
interface PartialEpisode {
  startDate: string;
  sells: ShareEvent[];
  orderIds: string[];
}

/** An episode whose position is flat, pending an exit or a rebuy. */
interface FlatEpisode {
  episode: PartialEpisode;
  endDate: string;
  closedAt: string;
}

/**
 * True when a position that went flat at `closedAt` was rebought at
 * `reopenedAt` soon enough to count as churn rather than a real exit — T212
 * fills a rebalance as sell-then-rebuy, sometimes in the same second.
 */
function isFlip(closedAt: string, reopenedAt: string): boolean {
  return (
    Date.parse(reopenedAt) - Date.parse(closedAt) < FLIP_MERGE_GAP_DAYS * MS_PER_DAY
  );
}

/** Build episodes (maximal spans where shares > 0) and merged exit events. */
export function buildEpisodes(orders: Order[], splits: Split[]): Episode[] {
  const events = buildShareEvents(orders, splits);
  const episodes: Episode[] = [];

  let shares = 0;
  let episodePeak = 0;
  let open: PartialEpisode | null = null;
  // A flattened episode is held back rather than emitted, so that a rebuy
  // moments later can resume it instead of splitting one trip into two.
  let flat: FlatEpisode | null = null;

  const emitFlat = () => {
    if (flat === null) return;
    episodes.push({
      startDate: flat.episode.startDate,
      endDate: flat.endDate,
      orderIds: flat.episode.orderIds,
      exitEvents: mergeExitSells(flat.episode.sells),
      isOpen: false,
    });
    flat = null;
  };

  for (const e of events) {
    const prevShares = shares;
    shares += e.sharesDelta;
    episodePeak = Math.max(episodePeak, shares);

    if (applyDust(shares, episodePeak) === 0) {
      shares = 0;
      episodePeak = 0;
    }

    if (prevShares <= 0 && shares > 0) {
      if (flat !== null && isFlip(flat.closedAt, e.order.executedAt)) {
        open = flat.episode;
        flat = null;
      } else {
        emitFlat();
        open = { startDate: e.date, sells: [], orderIds: [] };
      }
    }

    if (open !== null) {
      open.orderIds.push(e.order.id);
      if (e.sharesDelta < 0) open.sells.push(e);
    }

    if (prevShares > 0 && shares === 0 && open !== null) {
      flat = { episode: open, endDate: e.date, closedAt: e.order.executedAt };
      open = null;
    }
  }

  // Only one of the two can be set: opening an episode always resolves `flat`.
  emitFlat();
  if (open !== null && shares > 0) {
    episodes.push({
      startDate: open.startDate,
      endDate: null,
      orderIds: open.orderIds,
      exitEvents: mergeExitSells(open.sells),
      isOpen: true,
    });
  }

  return episodes;
}

/** The orders executed inside `episode`, in execution order. */
export function episodeOrders(episode: Episode, orders: Order[]): Order[] {
  const ids = new Set(episode.orderIds);
  return sortOrdersByExecution(orders.filter((o) => ids.has(o.id)));
}

/**
 * Cash dividends paid while `episode` was open. `epOrders` comes from
 * `episodeOrders`.
 *
 * The open is bounded by the opening buy's timestamp, not its date: a payout
 * landing earlier that day belongs to the previous trip. The close stays
 * date-inclusive, because a payout on the closing day arrives after the sell
 * as often as before it.
 */
export function episodeDividends(
  episode: Episode,
  epOrders: Order[],
  dividends: DividendCash[],
): DividendCash[] {
  const openedAt = epOrders[0]?.executedAt;
  if (openedAt === undefined) return [];
  return dividends.filter(
    (d) =>
      d.paidAt >= openedAt &&
      (episode.endDate === null || toUtcDate(d.paidAt) <= episode.endDate),
  );
}
