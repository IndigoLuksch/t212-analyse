import type { Episode, ExitEvent, Order, Split } from './types';
import { adjustOrder } from './splits';
import { applyDust, sortOrdersByExecution, toUtcDate } from './utils';

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
    const gap =
      (Date.parse(`${sells[i].date}T00:00:00Z`) -
        Date.parse(`${prev.date}T00:00:00Z`)) /
      86_400_000;
    if (gap < 7) {
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

/** Build episodes (maximal spans where shares > 0) and merged exit events. */
export function buildEpisodes(orders: Order[], splits: Split[]): Episode[] {
  const events = buildShareEvents(orders, splits);
  const episodes: Episode[] = [];

  let shares = 0;
  let episodePeak = 0;
  let currentSells: ShareEvent[] = [];
  let episodeStart: string | null = null;

  const closeEpisode = (endDate: string, isOpen: boolean) => {
    if (episodeStart === null) return;
    episodes.push({
      startDate: episodeStart,
      endDate: isOpen ? null : endDate,
      exitEvents: mergeExitSells(currentSells),
      isOpen,
    });
    currentSells = [];
    episodeStart = null;
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
      episodeStart = e.date;
    }

    if (e.sharesDelta < 0) {
      currentSells.push(e);
    }

    if (prevShares > 0 && shares === 0) {
      closeEpisode(e.date, false);
    }
  }

  if (episodeStart !== null && shares > 0) {
    episodes.push({
      startDate: episodeStart,
      endDate: null,
      exitEvents: mergeExitSells(currentSells),
      isOpen: true,
    });
  }

  return episodes;
}
