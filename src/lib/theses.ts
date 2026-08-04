import type { EntryContext } from '@/lib/metrics/entryContext';
import { addDays, daysBetween } from '@/lib/metrics/utils';

export const THESIS_REVIEW_DAYS = 182;

/** Default review date: created_at + 182 calendar days. */
export function defaultReviewAt(createdAt: string): string {
  return addDays(createdAt.slice(0, 10), THESIS_REVIEW_DAYS);
}

/**
 * Pick the first BUY on or after thesis creation. Earlier fills are ignored.
 */
export function resolveLinkedOrder(
  createdAt: string,
  buys: { id: string; executedAt: string }[],
): string | null {
  const sorted = [...buys].sort((a, b) => a.executedAt.localeCompare(b.executedAt));
  for (const buy of sorted) {
    if (buy.executedAt >= createdAt) return buy.id;
  }
  return null;
}

export function serializeEntryContext(ctx: EntryContext | null): string | null {
  return ctx ? JSON.stringify(ctx) : null;
}

export function parseEntryContext(json: string | null): EntryContext | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as EntryContext;
  } catch {
    return null;
  }
}

export function isDueForReview(
  reviewAt: string,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  return reviewAt <= today;
}

/** Negative when overdue. */
export function daysUntilReview(
  reviewAt: string,
  today = new Date().toISOString().slice(0, 10),
): number {
  return daysBetween(today, reviewAt);
}
